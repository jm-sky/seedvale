# God rays: whiteout na wyżynach / przy kamerze zza postaci

**Status:** `done`  
**Created:** 2026-08-11  
**Źródło:** Quick notes w `docs/plans/README.md` (mgła i god rays) + ponowna obserwacja na grzbietach/górach  
**Powiązane:** plan `2026-08-09--051--visual-atmosphere-lighting.md`, plan `2026-08-11--066--better-visual-effects.md` (atmospheric fog)

## Objaw

Na wyżynie/górze (długie linie widzenia, dużo nieba w kadrze) biały/jasny kolor zasłania ekran — trudno cokolwiek zobaczyć. To samo szczególnie przy kamerze third-person zza pleców postaci, z poziomu ziemi, gdy słońce jest z przodu.

Wcześniejsza poprawka (przesunięcie `fogNear` + clamp wkładu promieni do `0.8` w `godRaysShader.ts`) **nie usuwa** whiteoutu.

## Analiza (2026-08-11)

Pipeline:

```text
scena (Sky HDR + Fog) → AO → SMAA → Bloom → God rays → ACES (OutputPass)
```

God rays działają **po bloomie**, na jeszcze nie ztonemapowanym kolorze.

### 1. God rays — główny winowajca (naprawa niepełna)

`src/render/godRaysShader.ts`: przy jasnym niebie seria 32 próbek (`weight`/`decay`) daje ~`3.4 × intensity` przed clampem. Clamp `min(..., 0.8)` ogranicza ekstremum przy patrzeniu w słońce, ale nadal pozwala dodać do **prawie każdego piksela** do `+0.8` liniowego RGB. Z grzbietu bright-pass (`threshold: 0.6`) przepuszcza niebo i zamglony horyzont → cały kadr dostaje glow, nie wąskie smugi.

`src/render/createPostProcessing.ts::updateGodRays`:

| Mechanizm | Problem |
|---|---|
| Fade elewacji | Pełna moc przy `elev ≈ 0.08–0.12`; tuż po świcie (`tod ≈ 0.28`) intensity ≈ **0.92** |
| Facing fade | Pełna moc już przy `dot > 0.15` (~słońce w przedniej półsferze) — typowy third-person „zza pleców” |
| Brak testu on-screen | `lightPosition` poza `[0,1]` i tak odpala full intensity |
| Brak prawdziwej okluzji | Tylko jasność w `tDiffuse` (plan 051 zakładał occlusion/depth) |

### 2. Bloom przed god rays — wzmacniacz

`bloomThreshold` w configu jest opisany jak „post tone-map ~0–1”, ale bloom jest **przed** `OutputPass` → próg w liniowym HDR. Preetham Sky koło słońca często `>> 1` → duże halo → god rays rozmazują już rozświetlone niebo.

### 3. Mgła — drugi, realny czynnik na wyżynach

`fogNear`/`fogFar` w `dayNight.ts` (130–180 / 180–260). Z grzbietu teren za `fogFar` to jednolity `DAY_FOG` (`#9ec5e0`); niebo ma `fog = false`. Sama mgła rzadko robi full-screen whiteout, ale dokłada jasną bazę pod bloom + rays. Plan 066 też notuje „wyprany horyzont”.

### Dlaczego właśnie góry

1. Więcej nieba w kadrze → więcej próbek bright-pass.  
2. Mniej zasłonięć (drzewa pod treeline).  
3. Dalszy teren już w pełnej mgle → blade tło pod rays.  
4. Kamera third-person często trzyma słońce u góry kadru → radial blur ciągnie jasność w dół przez cały frame.

## Kierunek naprawy

**Szybki fix (ten issue):**

1. Niższy sufit wkładu rays (clamp ~`0.2`, nie `0.8`) + łagodniejsze `weight`/`exposure`/threshold.  
2. Węższy facing cone + fade gdy `lightPosition` wychodzi poza ekran.  
3. A/B: wyłączenie `godRaysEnabled` na grzbiecie powinno niemal usuwać whiteout.

**Później (osobno):**

- Łagodniejsza/atmospheric mgła (plan 066).  
- Ewentualnie rays przed bloomem albo prawdziwszy occlusion shaft (plan 051).

## Fix (2026-08-11)

Zaimplementowane:

1. `godRaysShader.ts` — clamp wkładu `0.8 → 0.2`; `weight 0.6 → 0.4`; `threshold 0.6 → 0.75`; default `exposure 0.35 → 0.22`.
2. `createPostProcessing.ts::updateGodRays` — węższy facing (`smoothstep(0.25, 0.65)` zamiast `(-0.15, 0.15)`); soft fade gdy rzutowane słońce wychodzi poza ekran.
3. `worldConfig.ts` — domyślne `godRaysExposure: 0.22` (GUI nadal pozwala podnieść; localStorage może trzymać starą wartość — clamp/facing działają mimo to).

**Zweryfikowane w przeglądarce (2026-08-11):** whiteout na wyżynach / zza postaci zniknął; rays zostają jako delikatne smugi.

## Pliki

- `src/render/godRaysShader.ts`
- `src/render/createPostProcessing.ts`
- `src/config/worldConfig.ts` (`godRaysExposure` default)

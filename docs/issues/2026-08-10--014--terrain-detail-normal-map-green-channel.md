# Normal-mapa terenu zapisana w złym kanale — „camo"/kontrastowe plamy na ziemi, których nie dało się ściszyć

**Status:** `verification needed` — naprawione 2026-08-10 (konwencja kanałów + `normalScale` jako suwak GUI). Wymaga wizualnej weryfikacji w przeglądarce.
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika (`screen-1.png`, `?seed=100`) — „na ziemi kontrast jest zbyt mocny", „chyba żaden parametr do tej pory nie zmniejszył natężenia efektu"

Pełna analiza + instrukcja na przyszłość: [reviews/2026-08-10--003--terrain-surface-detail.md](../reviews/2026-08-10--003--terrain-surface-detail.md)

## Objaw

Ziemia (szczególnie odsłonięty grunt polany wioski / korytarz drogi, gdzie nie ma trawy) pokryta gęstym, wysokokontrastowym wzorem ciemnych plam — „camo"/„moro". Cztery kolejne tury strojenia (obniżanie wag oktaw, obniżanie `normalScale` z 1 → 0.015 → 0.0075, zmiana częstotliwości, zmiana gęstości kafli) **nie zmniejszyły efektu**. Efekt uboczny: plamiaste odbicia w oceanie ([issue 009](./2026-08-10--009--ocean-normal-map-reflection-blotches.md)).

## Diagnoza — błąd konwencji kanałów, nie amplitudy

`terrainDetailNormalMap.ts` zapisywał wektor normalny jako:

```ts
normal.set(-(hR - hL), 2, -(hU - hD)).normalize()  // x → R, y → G, z → B
```

czyli **wektor „w górę" trafiał do kanału G**, a do B trafiało nachylenie. Zmierzone średnie kanałów upieczonej tekstury: **(127.5, 255.0, 127.5)** — mapa była zielona. Poprawna tangent-space normal-mapa (konwencja OpenGL, której używa three.js) ma „górę" w **B**: ≈ (128, 128, ~250), czyli jest lawendowo-niebieska.

three.js w chunku `normal_fragment_maps` robi:

```glsl
vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );
```

Skoro „góra" siedziała w G (czyli w `.xy`), to `normalScale`:

1. **skalował w dół sam wektor normalny**, zamiast skalować nachylenia,
2. zostawiał w B nachylenie — wartość **bliską zeru i zmieniającą znak** wraz z szumem.

Po normalizacji dominował więc kanał B, czyli szum ze zmiennym znakiem. Odtworzenie matematyki shadera na upieczonej teksturze przy `normalScale = 0.0075`: **średnie odchylenie normalnej od powierzchni 94°**, a znak kanału traktowanego przez three.js jako „góra" **zmieniał się 1105 razy na 4096 kolejnych teksli**. Stąd twarde, sąsiadujące jasne/ciemne plamy.

To wyjaśnia najważniejszą obserwację użytkownika: **obniżanie `normalScale` pogarszało sprawę**, bo im mniejsze `.xy`, tym bardziej dominowało błędnie umieszczone nachylenie w B. Przy `normalScale = 1` efekt był inny (stałe, duże przekrzywienie normalnych), ale też błędny. Żadna wartość nie dawała poprawnego wyniku — parametr nie mógł zadziałać.

Sanity check dla przyszłych sesji: **normal-mapa, która wygląda na zieloną, jest zepsuta.** Powinna być prawie jednolicie lawendowo-niebieska.

## Naprawa

1. `src/terrain/terrainDetailNormalMap.ts` — `normal.set(-(hR - hL), -(hU - hD), 2)`: oba nachylenia do R/G, „góra" do B. Po zmianie średnie kanały to (127.5, 127.5, 255.0), zero zmian znaku.
2. `src/config/worldConfig.ts` — nowy `terrain.detailNormal` (`DetailNormalConfig`: `enabled` / `strength` / `tilesPerChunk`), domyślnie `strength: 0.5`, `tilesPerChunk: 8`. Wartość `0.0075` była artefaktem błędu, nie sensowną siłą.
3. `src/terrain/buildChunkGeometry.ts` — `normalScale`/`repeat` biorą się z configu; przy `enabled: false` materiał nie dostaje `normalMap` w ogóle.
4. `src/ui/createDebugGui.ts` — folder **Surface grain (detail normal)**: `Enabled`, `Strength (normalScale)`, `Tiles per chunk`. Strojenie na żywo zamiast pętli „edytuj stałą → commit → poproś użytkownika o test".

## Przy okazji: AO nie dało się wyłączyć (naprawione)

Podczas diagnozy: `postProcessing.aoEnabled = false` dawało **pustą scenę** (samo niebo + HTML overlay). `N8AOPass` był jedynym passem renderującym scenę, a `EffectComposer` pomija wyłączone passy — więc wyłączenie AO usuwało cały render 3D. Dodany `RenderPass` włączany dokładnie wtedy, gdy AO jest wyłączone (`src/render/createPostProcessing.ts`), żeby scena nigdy nie renderowała się dwa razy. Bez tego nie da się wykluczyć AO jako podejrzanego przy kolejnych regresjach wizualnych.

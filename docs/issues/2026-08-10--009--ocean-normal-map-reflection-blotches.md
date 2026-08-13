# Ocean pokazuje gęste, "chmurowe" odbicia z twardymi krawędziami między kolorami

**Status:** `verification needed` — naprawione 2026-08-10 (częstotliwość detail normals). **2026-08-13:** lustro 256² wróciło w fazie 3 planu 098 (`waterMirror.ts`, nie Water.js). Detail normals terenu nie zagęszczane; wyłączenie `normalMap` na czas mirror camera nadal poza minimum.
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika po ostatniej turze strojenia normal-mapy terenu

## Objaw

Powierzchnia oceanu (`three/addons/objects/Water.js`, `src/world/createOcean.ts`) pokazuje gęste, przypominające chmury odbicia — zbyt dużo małych plam, z widocznymi twardymi krawędziami między sąsiadującymi obszarami o różnym kolorze/jasności, jakby "pływały" po wodzie.

## Diagnoza

Ocean nie ma własnego związku z `terrainDetailNormalMap.ts` (ma osobną, proceduralną normal-mapę fal — `createProceduralWaterNormals()` w `createOcean.ts`), ale **odbija całą scenę** przez kamerę-lustro Water.js do stosunkowo niskorozdzielczej tekstury (`textureWidth`/`textureHeight`: 512×512) rozciągniętej na duży fragment świata — więc każdy drobnoziarnisty szczegół na odbitym terenie ma niską efektywną gęstość teksli w tym przebiegu.

Poprzednia sesja (patrz `docs/plans/README.md` — normal-map terenu, trzecia tura strojenia) w tym samym commicie **jednocześnie**:
1. obniżyła amplitudę/kontrast siatki normal-mapy terenu (`terrainDetailNormalMap.ts` wagi oktaw, `buildChunkGeometry.ts` `normalScale`) — to poprawnie zmniejszyło efekt na lądzie,
2. **podniosła gęstość/częstotliwość** (`NORMAL_MAP_TILES_PER_CHUNK` 8→11, częstotliwości oktaw 6/14/30→8/18/38) — to zmniejszyło rozmiar plam, ale zwiększyło ich **liczbę**.

Druga zmiana (więcej, mniejszych plam) w bezpośrednim widoku na teren jest niezauważalna dzięki mipmapowaniu tekstury normal-mapy, ale w niskorozdzielczym przebiegu lustra Water.js te liczne drobne plamy diffuse'owego cieniowania (perturbacja normalnych zmienia jasność vertex-color terenu piksel-po-pikselu) aliasują się w większe, plamiaste kształty — dokładnie pasujące do zgłoszenia „zbyt dużo" (więcej plam) i „krawędzie między kolorami" (miejsca o silnym lokalnym kontraście normal-mapy, teraz częstsze).

## Naprawa

Cofnięto tylko część "gęstość/częstotliwość" ostatniej zmiany (z powrotem do `NORMAL_MAP_TILES_PER_CHUNK = 8`, oktawy `6/14/30`) — to bezpośrednio zmniejsza *liczbę* plam widocznych w odbiciu ("zbyt dużo ich"). Część "amplituda/kontrast" (niższe wagi oktaw, niższy `normalScale`) **została zachowana** — to ona odpowiada za to, że plamy są teraz subtelne, a nie za ich rozmiar, więc cofnięcie tylko gęstości nie przywraca pierwotnego "camo" efektu na lądzie.

## Poza zakresem teraz

Selektywne wyłączenie normal-mapy terenu tylko w przebiegu lustra Water.js (np. przez `onBeforeRender`/`onAfterRender` podmieniające `normalMap` na `null` na czas renderu lustra) — bardziej precyzyjne, ale inwazyjne rozwiązanie, nie potrzebne jeśli powyższa naprawa wystarczy.

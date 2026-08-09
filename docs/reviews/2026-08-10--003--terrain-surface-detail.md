# Review 003 — detal powierzchni terenu („teren wygląda płasko")

**Status:** `verification needed`
**Data:** 2026-08-10
**Zakres:** `src/terrain/terrainDetailNormalMap.ts`, `src/terrain/buildChunkGeometry.ts`, `src/terrain/biomeColors.ts` (`applyMicroTint`), `src/terrain/grass.ts`, `src/render/createPostProcessing.ts`
**Powód:** cztery kolejne commity strojenia normal-mapy terenu nie zmniejszyły zgłaszanego efektu „camo" na ziemi. Pytanie nie brzmiało „o ile jeszcze ściszyć", tylko „dlaczego ściszanie nie działa".

Ten plik ma dwie części: **(A) co było nie tak** i **(B) instrukcja dla kolejnych agentów** — jak dokładać/stroić subtelny detal powierzchni, żeby nie powtórzyć tej pętli.

---

## A. Wnioski

### A.1 Główna przyczyna: zła konwencja kanałów normal-mapy

Szczegóły i pomiary: [issues/014](../issues/2026-08-10--014--terrain-detail-normal-map-green-channel.md).

W skrócie: mapa była pieczona z wektorem „w górę" w kanale **G**, a three.js (konwencja OpenGL) oczekuje go w **B**. Efektem były normalne odchylone średnio **94°** od powierzchni, ze **znakiem zmieniającym się z częstotliwością szumu** — czyli dokładnie twarde, kontrastowe plamy ze zgłoszenia. Co ważniejsze: `normalScale` skalował w tej sytuacji sam wektor normalny, więc **im niższa wartość, tym gorszy artefakt**. Cztery tury „zmniejszmy amplitudę" nie mogły pomóc.

> **Reguła:** upieczona tangent-space normal-mapa musi być prawie jednolicie **lawendowo-niebieska** (średnie kanałów ≈ 128/128/~250). Jeśli wyszła zielona albo różowa — kanały są pomieszane i żadne strojenie siły tego nie naprawi.

### A.2 Dlaczego to trwało cztery commity — brak parametru na żywo

`normalScale`, `NORMAL_MAP_TILES_PER_CHUNK` i wagi oktaw były **zaszytymi stałymi**. Każda iteracja strojenia = edycja pliku, commit, prośba do użytkownika o test w przeglądarce. Przy takim koszcie iteracji naturalnie zmienia się kilka rzeczy naraz — i faktycznie [issue 009](../issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) opisuje regresję powstałą dokładnie dlatego, że amplituda i częstotliwość zmieniły się w jednym commicie. Naprawione: `terrain.detailNormal` + folder **Surface grain (detail normal)** w lil-gui.

### A.3 AO nie dawało się wyłączyć — brak `RenderPass`

`N8AOPass` był jedynym passem renderującym scenę, a `EffectComposer` pomija wyłączone passy. `aoEnabled: false` dawało pustą scenę (samo niebo + HTML overlay). To nie tylko bug użytkowy — to blokowało oczywisty krok diagnostyczny „wyłącz AO i zobacz, czy plamy zostają". Dodany `RenderPass` aktywny tylko przy wyłączonym AO.

### A.4 Co **nie** było przyczyną (sprawdzone, żeby nie sprawdzać drugi raz)

| Podejrzany | Weryfikacja | Wynik |
|---|---|---|
| Trawa (`grass.ts`, gęsta geometria blisko ziemi) | zrzut z `terrain.grass.enabled: false` | wzór **bez zmian** — to nie trawa |
| N8AO (radius 2, intensity 3) na trawie | próba `aoEnabled: false` | zablokowana przez A.3; po odrzuceniu trawy i tak nieistotna |
| `applyMicroTint` (`biomeColors.ts`) | ±4.5% mnożnika jasności per wierzchołek | zbyt słabe na obserwowany kontrast; **ale** patrz B.5 — to biały szum per wierzchołek, wart osobnego spojrzenia |
| Częstotliwość/gęstość kafli normal-mapy | zmieniana w 2 turach | wpływa na *rozmiar* plam, nie na kontrast |

---

## B. Instrukcja dla kolejnych agentów

### B.1 Czego chce użytkownik

Delikatna „turbulencja" na ziemi i trawie: albo **drobne ziarno** (piasek), albo **placki / mini-pagórki**. Nie musi być prawdziwe 3D — **displacement nie jest wymagany**, mapa albo shader wystarczy. Kluczowe słowo to *delikatny*: efekt ma być widoczny z bliska, a nie czytelny jako wzór z 30 metrów.

### B.2 Zanim cokolwiek zmienisz — ustal, co faktycznie widać

Nie stroj po opisie. Kolejność:

1. **Wyklucz warstwy przełącznikami**, nie edycją kodu: `terrain.detailNormal.enabled`, `terrain.grass.enabled`, `postProcessing.aoEnabled` (wszystkie trzy działają od 2026-08-10). Jeśli artefakt zostaje po wyłączeniu warstwy — to nie ta warstwa.
2. **Zweryfikuj sam asset offline.** Upieczoną mapę można sprawdzić bez przeglądarki — policz średnie RGB i odtwórz matematykę shadera (patrz A.1). To zajmuje minutę i złapało tu błąd, którego cztery tury strojenia nie złapały.
3. Dopiero potem stroj wartości.

### B.3 Jedna zmienna na turę

Amplituda (`strength`) i gęstość (`tilesPerChunk`) mają **różne objawy** i **różne skutki uboczne**:

- `strength` → kontrast cieniowania. To jest suwak od „za mocno".
- `tilesPerChunk` → rozmiar plamy. Podnoszenie **aliasuje w lustrze oceanu** (`Water.js` renderuje odbicie do 512×512, bez mipmap w tym przebiegu) — to była [issue 009](../issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md). Na lądzie tego nie widać, bo mipmapping to ukrywa. **Zawsze po zmianie gęstości spójrz na wodę pod kątem.**

Zmiana obu naraz = nie wiadomo, co spowodowało regresję. Dokładnie tak powstała issue 009.

### B.4 Zakres wartości (po naprawie konwencji)

Upieczona mapa daje przy `strength = 1`: średnie odchylenie normalnej **~2.1°**, maksymalne **~8.6°** — czyli sama w sobie jest już subtelna. Obecny default to `0.5`. Wartości rzędu `0.0075` nie mają sensu (to relikt błędu z A.1) — jeśli ktoś znowu proponuje setne części, to znak, że coś innego jest zepsute.

**Zmierzone po naprawie** (zrzuty z `?seed=100`, domyślna kamera 3rd-person): przy `strength` 0.5, 1.0 i **2.5** artefakt nie wraca, ale ziarno jest **ledwo widoczne** — kadr przy `strength: 2.5` różnił się od `enabled: false` minimalnie. Powód jest geometryczny, nie amplitudowy: przy 8 kaflach na chunk 64 jednostek jeden kafel 256² przypada na 8 jednostek, czyli teksel ma ~3 cm. Z wysokości kamery 3rd-person to poniżej piksela, więc **mipmapping uśrednia ziarno do płaskiego** zanim cokolwiek zobaczysz.

Wniosek: **podnoszenie samego `strength` to nie ta dźwignia** — potrzebne są *większe* cechy. Większe cechy to zresztą dokładnie ten kierunek, który **łagodzi** aliasing w oceanie z issue 009, więc obie potrzeby idą w tę samą stronę.

### B.4b Dwa kafelkowania: trawa vs. droga/piasek

Stąd obecny kształt configu — jeden `strength`, ale **dwa** kafelkowania, mieszane per fragment:

| Knob | Default | Gdzie działa |
|---|---|---|
| `strength` | `3` | wszędzie (`normalScale`) |
| `tilesGrass` | `4` | grunt porośnięty — duże, miękkie placki/mini-pagórki |
| `tilesBare` | `12` | droga, polana wioski, pas piasku przy brzegu, pustynia — drobne ziarno „piasku" |

Implementacja (`buildChunkGeometry.ts`): `Texture.repeat` potrafi wyrazić tylko jedno kafelkowanie, więc tiling przeszedł do shadera — `applyDetailNormalTiling()` podmienia dyrektywę `#include <normal_fragment_maps>` na dwa pobrania tej samej tekstury przy `uDetailTilesGrass` / `uDetailTilesBare` i `mix()` po varyingu `vBareGround`.

> **Pułapka, na którą się nadziałem — przeczytaj przed pisaniem `onBeforeCompile`:** shader podany do `onBeforeCompile` ma **nierozwinięte `#include`**; three woła `resolveIncludes()` dopiero później, w `WebGLProgram`. Podmienianie linii z *wnętrza* chunka (np. `vec3 mapN = texture2D( normalMap, vNormalMapUv )…`) jest więc no-opem: `String.replace` nie znajduje wzorca, shader kompiluje się bez Twojego kodu, a objaw to „efekt jest, ale suwaki nic nie robią i obie powierzchnie wyglądają tak samo". Podmieniaj **dyrektywę `#include <…>`**, nie treść chunka. I zawsze sprawdź, czy wzorzec w ogóle występuje (`includes()`), zamiast ufać, że `replace` coś zrobił.

Jeśli dyrektywa zniknie po aktualizacji three, kod wypisuje ostrzeżenie i wraca do stockowego renderu, zamiast po cichu skompilować shader bez uniformów.

Maska `aBareGround` (atrybut per wierzchołek) = `max(roadTint*2, pas piasku, biome.desert)` — `tile.roadTint` obejmuje zarówno drogi, jak i polany wiosek (`applyTerrainCorridors`), więc dirt w wiosce dostaje ziarno piasku automatycznie.

### B.5 Jeśli „delikatna turbulencja" nadal nie wystarcza

Opcje w kolejności rosnącego kosztu — **nie kumuluj ich w jednym podejściu**:

1. **Zostań przy detail normal map, zmień tylko kształt szumu.** Wagi oktaw w `terrainDetailNormalMap.ts` (`octave(6, …)` / `octave(14, …)` / `octave(30, …)`) sterują proporcją „placki vs ziarno": niska częstotliwość = mini-pagórki, wysoka = piasek. To jest właściwe miejsce na wybór „ziarno albo placki" z prośby użytkownika. Zmieniaj kształt **przy ustalonym `strength`**.
2. **UV w przestrzeni świata zamiast per-chunk.** Dziś UV każdego chunka biegnie 0..1 niezależnie, więc wzór nie jest ciągły fazowo przez granicę chunka (`tilesPerChunk = 8` maskuje szew, ale go nie usuwa) i gęstość ziarna zależy od `chunkSize`. Planarne UV z `worldX/worldZ` (albo triplanar na stromiznach) rozwiązuje jedno i drugie. To jest naturalny następny krok, jeśli szwy staną się widoczne.
3. **Wygaszanie z odległością.** Ziarno powierzchni ma sens do ~30–40 jednostek; dalej i tak aliasuje i zaczyna czytać się jako wzór, a nie jako faktura. Wymaga `onBeforeCompile` na materiale chunka (mieszanie `mapN` w stronę płaskiej normalnej wg `vFogDepth`). To rozwiązałoby też problem odbić w oceanie u źródła.
4. **Wyłączenie detalu w przebiegu lustra `Water.js`** (`onBeforeRender`/`onAfterRender` podmieniające `normalMap` na `null`) — precyzyjne, ale inwazyjne; zapisane jako „poza zakresem" w issue 009 i nadal nie zrobione.
5. **Mikro-displacement w wierzchołkach** — jedyna opcja dająca prawdziwą sylwetkę, ale kosztuje geometrię i wchodzi w konflikt z apronem/szwami w `buildChunkGeometry.ts`. Rozważać dopiero, gdy 1–4 nie wystarczą.

Osobno, poza normal-mapą: `applyMicroTint` (`biomeColors.ts`) dokłada **biały szum per wierzchołek** (`terrainTintNoise` to hash `sin`/`fract`, sąsiednie wierzchołki nieskorelowane) o amplitudzie ±4.5%, interpolowany Gouraudem. Przy `resolution: 65` na chunk 64 jednostek to szum o skali ~1 jednostki, który skaluje się z rozdzielczością siatki — nie z rozmiarem świata. Jeśli po naprawie normal-mapy ziemia nadal wygląda „brudno" z bliska, to jest drugi kandydat: zamiana na spójny szum w przestrzeni świata (jak `fbm.ts`) dałaby plamy o kontrolowanym rozmiarze zamiast ziarna zależnego od `resolution`.

### B.6 Jak testować

`CLAUDE.md` mówi: nie odpalaj headless Chrome do rutynowego testowania zmian — zweryfikuj technicznie (`npx tsc --noEmit`, `npm run lint`, `npm run build`) i poproś użytkownika o test na `localhost:5577`. Dla **artefaktów wizualnych, których nie da się opisać słowami**, zrzut ekranu bywa jednak najkrótszą drogą — ta sesja to potwierdziła (porównanie „z trawą / bez trawy" rozstrzygnęło podejrzanego w jednym kroku). Jeśli sięgasz po przeglądarkę:

- Sceną odniesienia jest `http://localhost:5577/?seed=100` — start gry stawia gracza przy studni w Lipowie, ta sama rama co `screen-1.png`.
- Warianty ustawiaj przez `localStorage['seedvale:worldConfig:v1']` **przed** przeładowaniem strony i kasuj zapis (`indexedDB.deleteDatabase('seedvale')`), żeby każdy wariant startował z tego samego New Game.
- Porównuj **kadry 1:1** (wycinek tego samego prostokąta), nie całe klatki przeskalowane — artefakt ma skalę kilku pikseli i ginie przy skalowaniu.
- Świat ładuje się kilkanaście sekund (generacja trawy idzie po main threadzie); zrzut zrobiony za wcześnie pokazuje puste niebo.

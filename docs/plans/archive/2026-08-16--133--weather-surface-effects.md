# Plan: Weather Surface Effects — Wet Ground, Puddles & Snow Cover

**Created:** 2026-08-16
**Status:** `done` ✅ — playtest 2026-08-18. See [implementation notes](./2026-08-16--133--weather-surface-effects-implementation-notes.md) — "Implementation summary" section.
**Priority:** medium · **Effort:** M
**Depends on:** none

domain: `world-terrain`
tags: [weather]

## Cel

Dodać prostą, spójną i wydajną wizualną reakcję powierzchni świata na deszcz i śnieg.

Obecnie deszcz jest widoczny jako particles + zmiana światła/fog, ale teren pozostaje wizualnie suchy. Śnieg ma particles, ale brak akumulacji na powierzchni.

Efekt ma przede wszystkim poprawić czytelność pogody bez tworzenia osobnego systemu symulacji powierzchni.

## Założenia

- Rozszerzyć istniejący system weather, zamiast tworzyć równoległy system pogodowy.
- Rozszerzyć istniejący terrain fragment shader zamiast tworzyć osobne mesh/decals dla mokrej ziemi i kałuż.
- Brak per-chunk CPU updates podczas deszczu/śniegu.
- Brak raycastów, fizyki kałuż, dynamicznego generowania geometrii i osobnych draw calli.
- Wykorzystać istniejące `WeatherState`, `startedAt`, `endsAt`, terrain world-space noise, `vWorldPos`, `vBareGround` oraz informacje o powierzchni.
- Efekt ma działać również poza bezpośrednim centrum uwagi gracza bez konieczności śledzenia tysięcy obiektów.
- Nie dodawać nowego pola do save schema, jeśli stan można deterministycznie wyprowadzić z czasu świata i climate.

## Zakres

### 1. Wet ground podczas i po deszczu

Dodać wizualnie wyprowadzoną wartość mokrości powierzchni (`wetness`) zależną od aktualnego i niedawno zakończonego deszczu.

Oczekiwane zachowanie:

- deszcz → teren stopniowo ciemnieje i staje się mniej matowy,
- koniec deszczu → powierzchnia pozostaje mokra,
- dalszy brak deszczu → wetness stopniowo spada,
- brak deszczu przez odpowiednio długi czas → normalny suchy wygląd.

Wetness nie powinna być osobnym symulowanym stanem per chunk.

### 2. Subtelne kałuże

Wykorzystać istniejący world-space noise terrain shadera do wygenerowania nieregularnej `puddleMask`.

Kałuże powinny preferować:

- płaskie powierzchnie,
- drogi i place,
- odsłoniętą ziemię / `vBareGround`.

Powinny być ograniczone na stromych zboczach i w wysokiej trawie.

Wizualnie:

- ciemniejsza powierzchnia,
- niższy roughness,
- subtelny specular/reflection response,
- brak wyraźnych geometrycznych krawędzi.

Kałuże nie są osobnymi obiektami świata.

### 3. Snow cover

Podczas śniegu teren powinien stopniowo pokrywać się jasną warstwą śniegu.

`snowAmount` powinien być wyprowadzany shaderowo i preferować powierzchnie płaskie.

Oczekiwany wygląd:

- ziemia → jaśniejsza / bielsza,
- trawa → częściowo przykryta śniegiem,
- płaskie powierzchnie → większe pokrycie,
- strome zbocza → mniejsze pokrycie,
- naturalne przejścia bez osobnej geometrii.

### 4. Topnienie śniegu

Po zakończeniu opadu śnieg nie powinien znikać natychmiast.

Docelowe przejście:

`Snow → Melting → Wet ground → Puddles → Dry`

Topnienie powinno być tanim efektem wizualnym opartym o istniejący czas świata / climate, bez per-chunk symulacji.

Temperatura z istniejącego weather systemu może być użyta jako czynnik przyspieszający lub spowalniający topnienie, ale nie należy tworzyć nowego systemu temperatury.

## Integracja z istniejącym renderingiem

Pierwszym miejscem do sprawdzenia i rozszerzenia jest:

- `src/terrain/buildChunkGeometry.ts` — istniejący `MeshStandardMaterial` + `onBeforeCompile` terrain surface shader,
- `src/world/weather.ts` — istniejący deterministyczny climate/weather state,
- `src/world/weatherVisuals.ts` — istniejąca reakcja światła/fog,
- `src/world/weatherParticles.ts` — istniejący GPU rain/snow renderer.

Należy zachować obecny model, w którym terrain chunks korzystają ze wspólnego materiału/programu zamiast tworzenia materiału per chunk.

## Wydajność

Priorytetem jest koszt GPU/CPU odpowiedni dla dużej liczby chunków i słabszych urządzeń.

Preferowane rozwiązanie:

- 0 nowych draw calls,
- 0 nowych meshów/instancji dla kałuż,
- 0 per-particle CPU loops,
- 0 per-chunk wetness updates co klatkę,
- brak alokacji w runtime podczas zmiany pogody,
- reuse istniejących noise functions zamiast wprowadzania ciężkiej tekstury maski,
- ewentualne dodatkowe shader operations utrzymać małe i uzasadnione wizualnie.

Nie optymalizować przez tworzenie drugiego quality/LOD systemu — wykorzystać istniejące ustawienia jakości, jeśli efekt wymaga ograniczenia kosztu.

## Czego nie robić

- Nie tworzyć osobnego `PuddleManager`.
- Nie tworzyć `SnowManager` odpowiedzialnego za per-chunk stan.
- Nie tworzyć tysięcy kałuż jako `Mesh`/`Decal`.
- Nie modyfikować geometrii chunków po rozpoczęciu deszczu/śniegu tylko po to, aby pokazać efekt.
- Nie dodawać nowego pola save tylko dla wizualnego wetness/snow cover.
- Nie zmieniać deterministycznego modelu pogody.
- Nie przebudowywać istniejącego GPU weather particle renderera.

## Proponowany model wizualny

Jedna warstwa powierzchniowa może łączyć efekty:

```text
weather/climate
      │
      ├── rain ──→ wetness ──→ puddle mask
      │
      └── snow ──→ snow cover
                       │
                       └── temperature/time ──→ melting
                                              │
                                              └── wetness
```

Wszystkie wartości są przede wszystkim parametrami renderingu, a nie osobną symulacją świata.

## Otwarte decyzje do review

1. Czy wetness powinien reagować tylko na `rain`, czy również na `cloudy`/inne opady?
2. Jak długi powinien być czas wysychania po deszczu w relacji do czasu świata?
3. Czy puddles powinny być widoczne wyłącznie na `vBareGround`, czy także częściowo na krótkiej trawie?
4. Czy śnieg powinien być zależny głównie od temperatury, czy od czasu trwania opadu?
5. Czy snow cover ma być czysto wizualny, czy później powinien zostać wykorzystany przez inne systemy świata?
6. Jak silny powinien być specular kałuż, aby efekt był czytelny, ale nie wyglądał jak plastikowa powierzchnia?
7. Czy potrzebny jest osobny benchmark pogody, czy wystarczy wykorzystać istniejący performance/debug workflow?

## Weryfikacja

Technicznie:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/manual:

- wymusić `rain`, `snow`, `clear` przez istniejący debug weather override,
- sprawdzić przejście rain → clear i czas wysychania,
- sprawdzić snow → clear oraz topnienie,
- sprawdzić kałuże na drodze, placu, trawie i zboczu,
- sprawdzić snow cover na płaskim i stromym terenie,
- sprawdzić chunk streaming podczas aktywnej pogody,
- sprawdzić brak shader/WebGL errors,
- sprawdzić zachowanie na niższym quality/LOD.

Performance:

- porównać clear/rain/snow pod kątem frame time,
- zwrócić uwagę szczególnie na fragment shader cost terenu,
- nie uznawać efektu za zweryfikowany wydajnościowo bez rzeczywistego pomiaru.

## Definition of Done

- Deszcz powoduje widoczne, ale subtelne zmoczenie terenu.
- Po deszczu teren pozostaje mokry i stopniowo wysycha.
- Na odpowiednich płaskich powierzchniach pojawiają się nieregularne kałuże.
- Śnieg pokrywa teren w sposób zależny od nachylenia.
- Śnieg nie znika natychmiast po zakończeniu opadu.
- Topnienie prowadzi naturalnie do mokrej powierzchni.
- Brak nowych per-chunk/per-puddle obiektów i ciężkiej CPU symulacji.
- Istniejący weather/terrain architecture pozostaje źródłem prawdy.
- Testy/build/lint przechodzą.
- Browser verification potwierdza efekt wizualny i brak regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

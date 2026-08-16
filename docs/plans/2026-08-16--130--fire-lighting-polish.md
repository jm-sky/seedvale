# Plan: Fire & Lighting Polish

**Created:** 2026-08-15  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** none

## Cel

Dopracować ogień w Seedvale tak, aby jego zapalanie i działanie dawało wyraźnie lepszy efekt wizualny oraz dźwiękowy, bez wprowadzania ciężkiego systemu GPU particles ani równoległego systemu ognia.

Efekt docelowy:

`krzesiwo → białe iskry + SFX → żar → narastający płomień → pełny ogień`

Dla osady:

`zmrok → strażnik → zapala ognisko/pochodnie → osada stopniowo rozświetla się`

## 1. Zapalanie ogniska

Wykorzystać istniejące `VillageFire.light()`, `addFuel()`, `IGNITE_DURATION_SEC`, `CampfireFlame` i `createSparks()`.

Po rozpoczęciu rozpalania:

1. uruchomić krótki efekt krzesiwa,
2. wygenerować **biały burst iskier z krzesiwa**,
3. odtworzyć dźwięk krzesiwa,
4. pokazać żar przy podstawie,
5. zwiększać płomień od `0` do `100%`,
6. przejść do normalnego stanu `lit`.

Płomień nie powinien pojawiać się natychmiast w pełnym rozmiarze.

## 2. Iskry

Rozszerzyć istniejące `src/shared/getFireParticles.ts`, zamiast tworzyć drugi system.

Każda iskra:

- startuje przy podstawie płomienia,
- ma początkową prędkość mocno w górę i lekko losowo na boki,
- posiada gravity,
- może mieć niewielki boczny drift,
- po krótkim lifetime wygasa,
- zmniejsza intensywność przed końcem życia.

### Iskry krzesiwa

Osobny krótki burst przy rozpoczęciu zapalania:

- **biały kolor**,
- mocniejszy niż normalne iskry,
- krótki lifetime,
- wyraźny impuls w górę i na boki.

### Iskry normalnego ognia

- mała liczba particles,
- cieplejszy kolor,
- ciągły, tani efekt.

## 3. Żar

Dodać lekki efekt żaru jako wariant istniejącego particle systemu:

- kilka małych emissive punktów,
- czerwono-pomarańczowy,
- przy podstawie płomienia,
- lekko unoszący się,
- krótki lifetime,
- nieregularna intensywność.

Żar powinien być widoczny również podczas rozpalania, zanim płomień osiągnie pełny rozmiar.

## 4. Narastanie płomienia

Rozszerzyć `CampfireFlame` o kontrolowany poziom intensywności/rozmiaru.

Przykładowo:

- `0%` — sam żar,
- `20–40%` — mały płomień,
- `60–80%` — normalizujący się płomień,
- `100%` — pełny ogień.

Zachować istniejące powiązanie wielkości płomienia z `fuelRemaining`.

## 5. Shader / rendering ognia

### W pierwszej wersji NIE

Nie budować pełnego shaderowego systemu płomieni ani GPU particle frameworku.

Najpierw wykorzystać istniejący płomień + tanie particles. Shader można rozważyć później, jeśli browser review pokaże, że płomień nadal wygląda zbyt statycznie.

Potencjalny późniejszy shader powinien działać na istniejącej geometrii/sprite i dodawać proceduralne deformowanie, noise i emissive bez CPU aktualizowania geometrii.

## 6. Dźwięk krzesiwa

Dodać krótki SFX metalicznego krzesiwa i podłączyć go do istniejącego systemu audio.

Dźwięk powinien być zsynchronizowany z rozpoczęciem rozpalania.

Jeśli potrzebny jest nowy asset, zaktualizować `docs/assets/SOUNDS.md`.

## 7. Strażnik i światła osady

Ognisko oraz pochodnie w osadzie powinny być częścią istniejącej rutyny NPC.

Strażnik:

- odpowiada za nocne oświetlenie,
- około zmroku sprawdza lokalne źródła światła,
- podchodzi do niezapalonych ognisk/pochodni,
- wykonuje istniejący mechanizm zapalania,
- wraca do swojej rutyny.

Nie tworzyć osobnego systemu AI tylko dla ognia. Wykorzystać istniejące profession/schedule/movement/action systems oraz `VillageFire`.

Najpierw ustalić istniejącą reprezentację pochodni w `settlement/props.ts`. Jeśli są wyłącznie wizualne, dodać minimalny stan `lit` potrzebny do zachowania spójności z działaniem strażnika.

## 8. Wydajność

Założenia:

- normalny ogień: bardzo mała liczba particles,
- iskry i żar: `THREE.Points`,
- brak indywidualnych `Mesh` dla każdej iskry,
- brak per-particle alokacji w `update()`,
- brak workerów,
- brak GPU particle systemu w tym etapie.

Jeżeli wiele źródeł ognia będzie aktywnych jednocześnie, później można rozważyć współdzielenie/batching particles.

## 9. Zakres

### W zakresie

- [ ] ulepszenie istniejących sparks,
- [ ] gravity + boczny velocity,
- [ ] **biały burst iskier przy krzesiwie**,
- [ ] żar,
- [ ] płynne `0 → 100%`,
- [ ] SFX krzesiwa,
- [ ] strażnik zapalający ognisko,
- [ ] strażnik zapalający pochodnie,
- [ ] aktualizacja asset backlogu, jeśli potrzebne są nowe dźwięki.

### Poza zakresem

- [ ] pełny GPU particle framework,
- [ ] ogólny `FireManager`,
- [ ] symulacja temperatury,
- [ ] dym jako osobny system,
- [ ] wszystkie dekoracyjne ogniska świata,
- [ ] multiplayer/networking,
- [ ] przebudowa istniejącego systemu `VillageFire`.

## 10. Implementacja — kolejność

1. **Fire visual foundation** — `CampfireFlame` i kontrolowany poziom rozpalania.
2. **Sparks** — gravity, velocity, fade i biały ignite burst.
3. **Embers** — żar połączony z fazą rozpalania i stanem ognia.
4. **Ignition audio** — SFX przez istniejący kanał audio.
5. **Settlement lighting** — podłączenie zapalania do rutyny strażnika i pochodni.
6. **Tuning** — lifetime, gravity, spawn rate, flame ramp, light intensity, SFX volume.

## 11. Weryfikacja

### Techniczna

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`

### Browser/manual

- [ ] zapalenie ogniska pokazuje **białe iskry z krzesiwa**,
- [ ] iskry mają ruch w górę + na boki + opadanie,
- [ ] pojawia się żar,
- [ ] płomień rośnie `0 → 100%`,
- [ ] dźwięk krzesiwa jest zsynchronizowany z akcją,
- [ ] normalny ogień ma subtelne iskry i żar,
- [ ] strażnik faktycznie podchodzi i zapala ognisko,
- [ ] strażnik zapala pochodnie,
- [ ] kilka źródeł ognia jednocześnie nie powoduje istotnego wzrostu kosztu renderingu.

Po implementacji porównać `draw calls`, `triangles` i FPS w osadzie z aktywnymi źródłami ognia.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

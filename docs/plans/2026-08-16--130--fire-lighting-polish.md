# Plan: Fire & Lighting Polish

**Created:** 2026-08-15  
**Status:** `verification needed` 🔍 — core visual/audio scope implemented (see [implementation notes](./2026-08-16--130--fire-lighting-polish-implementation-notes.md)); guard/torch NPC lighting split off, no profession/action foundation exists yet; no browser verification  
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

- [x] ulepszenie istniejących sparks,
- [x] gravity + boczny velocity,
- [x] **biały burst iskier przy krzesiwie**,
- [x] żar,
- [x] płynne `0 → 100%`,
- [x] SFX krzesiwa (istniejący `action-fire-ignite-01`, zsynchronizowany z `light('player')`, wyciszony dla `'night'`),
- [ ] strażnik zapalający ognisko — **odłożone**: nie istnieje profession/schedule-action foundation dla strażnika (patrz implementation notes §9/§15); wymaga osobnego planu zależnego od 060-owej bazy,
- [ ] strażnik zapalający pochodnie — **odłożone** z tego samego powodu,
- [x] aktualizacja asset backlogu, jeśli potrzebne są nowe dźwięki — nie było potrzeby (istniejący SFX pokrywa zakres, patrz implementation notes §6).

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

- [x] `npx tsc --noEmit` — zielone
- [ ] `npm run lint` — pominięte na wyraźne polecenie (task instructions)
- [x] `npm run build` — zielone
- [x] `npm run test` — 845/845 zielone

### Browser/manual

Nie wykonane w tej sesji (zgodnie z poleceniem — użytkownik testuje ręcznie).

- [ ] zapalenie ogniska pokazuje **białe iskry z krzesiwa**,
- [ ] iskry mają ruch w górę + na boki + opadanie,
- [ ] pojawia się żar,
- [ ] płomień rośnie `0 → 100%`,
- [ ] dźwięk krzesiwa jest zsynchronizowany z akcją,
- [ ] normalny ogień ma subtelne iskry i żar,
- [ ] kilka źródeł ognia jednocześnie nie powoduje istotnego wzrostu kosztu renderingu.
- [ ] ~~strażnik faktycznie podchodzi i zapala ognisko~~ — odłożone, patrz wyżej,
- [ ] ~~strażnik zapala pochodnie~~ — odłożone, patrz wyżej.

Po implementacji porównać `draw calls`, `triangles` i FPS w osadzie z aktywnymi źródłami ognia.

## Implementacja — stan faktyczny (2026-08-16)

Zaimplementowano zgodnie z review w [implementation notes](./2026-08-16--130--fire-lighting-polish-implementation-notes.md) §15 "Core scope":

- `VillageFire` (`src/settlement/VillageFire.ts`): `light(source?: 'player' | 'night' | 'npc')` (default `'player'`) uruchamia proces zapalania zamiast natychmiastowego stanu — `isLit()` prawdziwe od razu (istniejący konsumenci jak cooking/fuel/fauna-fire-avoidance bez zmian), nowe `isIgniting()`/`getIgniteProgress()` napędzają rampę `0 → 1` przez istniejące `IGNITE_DURATION_SEC`. Biały spark-burst (`flame.igniteBurst()`) i `hooks.onLight`'s `source` odpalają się tylko dla `'player'` — autolight nocny (`createSettlement.ts`, `fire.light('night')`) dostaje tę samą wizualną rampę, ale bez krzesiwa/SFX (nikt fizycznie nie krzesa).
- `CampfireFlame` (`src/settlement/props.ts`): pozostaje warstwą renderingu, nie właścicielem stanu — nowe `setIntensity(t)` (smoothstep ease, steruje widocznością/skalą stożka płomienia + intensywnością światła + opacity iskier) i `igniteBurst()`. `setSize`/fuel-driven skala bez zmian. Domyślnie `intensity = 1`, więc pochodnie (`createVillageTorchLight`), które nigdy nie wołają `setIntensity`, zachowują dotychczasowy efekt.
- `src/shared/getFireParticles.ts`: przepisane na wspólny, mały `createParticlePool` (grawitacja, boczny drift z tłumieniem, per-vertex fade przez `vertexColors`+`AdditiveBlending` zamiast shadera) używany przez trzy fabryki — `createSparks` (istniejące, rozszerzone), nowe `createEmbers` (żar, 5 punktów, wolny unos, czerwono-pomarańczowy) i `createIgniteBurst` (biały one-shot burst, 10 punktów, `trigger()`). Brak alokacji w `update()`; `PlayerTorch.ts`'s użycie `createSparks` niezmienione (kompatybilny kształt).
- `PlacedFires.ts` / settlement campfire w `props.ts` dzielą dokładnie ten sam `createCampfireFlame`/`createVillageFire`, więc gracz-zbudowane ogniska (`'simple'` budowane od razu zapalone, `'pit'` zapalane przez istniejącą `[E]` interakcję) dostają identyczny polish bez osobnego kodu.
- Dźwięk: żaden nowy asset — `action-fire-ignite-01` (już `wired` w `docs/assets/SOUNDS.md`) odtwarzany tylko dla `source === 'player'` w `onLight` hookach (`createSettlement.ts`, `PlacedFires.ts`); nocny autolight jest cichy.
- Strażnik/pochodnie (plan §7): **nie zaimplementowane** — w kodzie nie istnieje żaden profession/AI-guard, `grep -i guard` w `src/` trafia wyłącznie na `guardSword`/kod niezwiązany z NPC-profession. Zgodnie z implementation notes §9/§15 wymaga to najpierw fundamentu profession/schedule-action (poza planem 060, który dostarcza tylko trait overlays + wykonywalny grafik, nie wybór akcji per-profesja) — rozdzielone do osobnego, przyszłego planu zamiast rozbudowywania 130 w plan AI.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

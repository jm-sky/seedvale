# Plan: zwierzęta unikają ognisk + uciekają przed zauważonym graczem

**Status:** `verification needed` — zaimplementowane, `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste, wizualna weryfikacja w przeglądarce jeszcze nie zrobiona.
**Created:** 2026-08-10

## Skąd to się wzięło

Fauna reagowała dotąd **wyłącznie na inne zwierzęta** (`updatePredator`/`updatePrey` w `src/fauna/AnimalAgent.ts`, czysto odległościowe `nearest()`). Pozycja gracza docierała do `AnimalAgent.update()` tylko do przygaszania etykiety CSS2D — zero wpływu na zachowanie. User chciał: (1) zwierzęta trzymają się z daleka od zapalonych ognisk, (2) uciekają przed graczem, jeśli jest za blisko **i go zauważą** — zależnie od kierunku patrzenia (stożek widzenia), a jako rozszerzenie też od terenu/otoczenia, pory dnia i gatunku. HP/stamina wpływające na to zachowanie to explicite "później" — Faza 2, poza zakresem tej iteracji.

## Implementacja

- `src/fauna/playerAwareness.ts` (nowy, czysta logika bez THREE — testowalna zgodnie z konwencją projektu, `src/fauna/HealthState.ts` jest jedynym dotąd testowanym plikiem w `src/fauna/`): `isPlayerNoticed({distance, facingDot, panicRange, noticeRange, dayFactor, forestFactor, minFacingDot})` — twardy `panicRange` zawsze wygrywa (zaskoczenie z bliska, niezależnie od kierunku); poza nim: efektywny zasięg = `noticeRange × (0.5 + 0.5×dayFactor) × (1 − forestFactor×0.5)` (noc i las tłumią zasięg, nigdy do zera) + sprawdzenie stożka (`facingDot >= minFacingDot`). `playerAwareness.test.ts` — 9 testów (panic-radius, tłumienie noc/las, odcięcie stożkiem).
- `src/fauna/AnimalAgent.ts`:
  - `AnimalDef` += `playerNoticeRange`/`playerPanicRange` per gatunek (wilk 10/3, lis 9/3, sarna 18/4, jeleń 16/4 — drapieżniki mniej płochliwe niż ofiary, ale też reagują).
  - Nowe stałe: `PLAYER_NOTICE_CONE_DOT = 0.3` (wspólny próg stożka), `ALERT_HOLD_SEC = 5` (histereza — po zauważeniu zwierzę ucieka jeszcze 5s nawet gdy świeży check by już nie przeszedł, żeby uniknąć migotania na granicy zasięgu/stożka), `FIRE_AVOID_RADIUS = 11`, `FLEE_DISTANCE = 8` (wyodrębnione z dotychczasowej hardkodowanej wartości `8` w `updatePrey`).
  - Nowa metoda `checkEnvironmentalDanger()` — wołana na samym początku `update()`, **przed** dotychczasową gałęzią predator/prey, **dla obu ról** (wilk też ucieka przed ogniem/człowiekiem, nie tylko sarna): liczy `facingDot` przez ten sam dot-product co `interaction/findInteractionTarget.ts::pickInGaze` (na `mesh.rotation.y` zwierzęcia zamiast yaw gracza), woła `isPlayerNoticed(...)`; jeśli zauważony → zwraca pozycję gracza (i odświeża `alertTimer`). Inaczej sprawdza najbliższe zapalone ognisko w `FIRE_AVOID_RADIUS` (czysto odległościowe, bez stożka). Cokolwiek zwrócone → `fleeFrom(x, z, dt)`, pomijając resztę `update()` na tę klatkę.
  - Nowa metoda `fleeFrom(x, z, dt)` — wyodrębniona z dotychczasowego kodu `updatePrey` (ten sam wektor-od-zagrożenia/sprint/steerToward), reużyta teraz przez ucieczkę-przed-predatorem, przed-graczem i przed-ogniem — zero duplikacji.
  - `update()` sygnatura: `dayFactor`/`forestFactor`/`litFires` zamiast dotychczasowego binarnego `isNight` (nadal wyliczane wewnętrznie jako `dayFactor <= 0` — istniejąca logika prędkości nocnej bez zmian).
- `src/terrain/chunkManager.ts`: nowy `sampleForestFactor(x, z)` na `ChunkManager` — komponuje `sampleMoistureRegion`/`sampleHeight`/`config.region`/`config.heightScale` przez `biomeRegions.ts::biomeWeightsAt` (ten sam wzorzec co `terrain/chunkItems.ts` przy generacji), zwraca wagę lasu 0-1. Runtime-queryable, main-thread, tani (ten sam koszt co już wołany per zwierzę `sampleHeight`).
- `src/fauna/createFauna.ts`: `createFauna()` += param `sampleForestFactor`; `Fauna.update()` += param `litFires`; `dayFactor` przekazywany ciągły (nie tylko `isNight`); `forestFactor` liczony per zwierzę z jego aktualnej pozycji.
- `src/app/createApp.ts`: `buildFauna()` przekazuje `chunkManager.sampleForestFactor`; w `tick()` budowana lista `litFires` (zapalone ogniska wiosek + budowane przez gracza, `settlementsManager.getLoaded()` + `placedFires.list()`, filtrowane przez `isLit()`) tuż przed `fauna.update(dt, player.mesh.position, dayNight.timeOfDay, litFires)`.

## Faza 2 (poza zakresem tej iteracji, explicite "później")

- HP/stamina wpływające na notice-range/panic-range/szansę ucieczki — `HealthState` już istnieje na `AnimalAgent`, stamina nie istnieje wcale (nowy koncept, wymaga osobnego planu — dotyczy też gracza?).
- Line-of-sight / raycasting przez teren i budynki (dziś: czysty dystans+stożek+biom, bez okluzji geometrycznej).
- Wpływ prędkości/skradania się gracza (sprint zwiększa zasięg wykrycia) — nieproszone, tanie do dodania później (`player.sprinting` już istnieje).
- Gęstość roślinności/trawy jako modyfikator "otoczenia" (dziś tylko biom jako proxy — prawdziwa gęstość wymaga nowej infrastruktury, `chunkVegetation.ts`/`grass.ts` nie eksponują ciągłego pola).
- Atakowanie/krzywdzenie gracza przez zwierzęta — gracz nadal nie ma HP.

## Weryfikacja

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste (43 testy, w tym 9 nowych).
- **Do zrobienia przez użytkownika (`localhost:5577`):** podejść do zapalonego ogniska (wioski MD/LG lub zbudowanego przez gracza) — zwierzęta trzymają dystans; podejść do zwierzęcia od tyłu blisko — nie ucieka od razu (poza zasięgiem paniki); podejść z przodu w jego polu widzenia z większej odległości — ucieka; porównać zasięg w nocy vs dzień i w lesie vs otwartym terenie; sprawdzić że zarówno wilk/lis (drapieżniki) jak i sarna/jeleń (ofiary) reagują na gracza/ogień, nie tylko ofiary; sprawdzić że polowanie drapieżnik→ofiara nadal działa normalnie gdy gracz/ogień nie są w pobliżu.

## Powiązane

- `src/fauna/AnimalAgent.ts`, `src/interaction/findInteractionTarget.ts` (wzorzec stożka), `src/terrain/biomeRegions.ts`, `src/settlement/VillageFire.ts`/`PlacedFires.ts` (ogniska)

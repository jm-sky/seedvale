---
domain: fauna
tags: [items-player, world-terrain]
---

# Plan: Fauna — limity populacji i wyczerpywanie spawn pointów

**Created:** 2026-08-16  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~110~~ ~~118~~

## Cel

Dopracować istniejący system animal spawn pointów tak, aby fauna miała kontrolowaną liczebność, a intensywne polowanie gracza mogło realnie zmienić stan lokalnego siedliska.

Mechanizm ma rozszerzać istniejący `PreySpawner` / `createFauna` / `AnimalAgent` zamiast tworzyć równoległy system spawnów lub osobny system populacji.

### Efekt gameplay

- każdy spawn point ma ograniczoną populację danego gatunku,
- zabijanie zwierząt może doprowadzić do wyczerpania lokalnego spawn pointu,
- gracz może podpalić/„zniszczyć” wyczerpane siedlisko,
- teren wyraźnie pokazuje, że miejsce zostało spalone,
- po czasie natura może odzyskać spawn point, ale tylko gdy gatunek nadal występuje w okolicy.

---

## 1. Istniejący system — najpierw rozszerzyć, nie dublować

Przed implementacją sprawdzić aktualne przepływy:

- `src/fauna/AnimalSpawner.ts` — `PreySpawner`, `updateSpawners`, `maxPreyCount`, respawn timer,
- `src/fauna/createFauna.ts` — tworzenie spawn pointów, początkowe spawnowanie i respawn,
- `src/fauna/AnimalAgent.ts` — `animalId`, śmierć i lifecycle zwierzęcia,
- `src/fauna/herdCohesion.ts` — obecne grupowanie/spawn młodych,
- `src/interaction/Interactable.ts` + `src/app/interactables.ts` — istniejący interaction pipeline dla spawnerów,
- `src/world/worldContext.ts` / `src/world/dayNight.ts` — `elapsedDays` i czas świata,
- istniejący system ognisk i zużywania gałęzi,
- istniejący system modyfikacji terenu / propsów / drzew.

Istotne: obecny `PreySpawner` już posiada `maxPreyCount`, ale jest to wyłącznie bieżący limit żywych zwierząt w promieniu spawnera. Nie zastępować go drugim, niezależnym limitem. Rozszerzyć jego znaczenie o lokalny stan populacji.

---

## 2. Konfigurowalny limit populacji per gatunek

Dodać jedno źródło konfiguracji limitów, łatwe do strojenia.

Przykładowo:

```ts
const SPAWN_POINT_POPULATION_LIMITS: Partial<Record<AnimalKind, number>> = {
  deer: 6,
  stag: 4,
  boar: 4,
  rabbit: 6,
  duck: 4,
}
```

Dokładne wartości należy dobrać na podstawie istniejącego spawnowania, a nie kopiować bezpośrednio powyższych przykładów.

Zasady:

- limit dotyczy konkretnego spawn pointu i gatunku,
- wartości są centralnie konfigurowalne,
- brak niekontrolowanego namnażania przez respawn,
- początkowy spawn również respektuje limit,
- herd/juvenile z planu 118 nie może omijać limitu spawn pointu.

Dla przykładu `deer = 6` oznacza maksymalnie 6 aktywnych osobników przypisanych do danego spawn pointu.

---

## 3. Tożsamość i stan spawn pointu

Obecny spawner ma pozycję, gatunek i timer, ale nie posiada pełnego lifecycle. Rozszerzyć istniejący typ o stabilny stan lokalnego siedliska.

Docelowo:

```text
active
   ↓
>50% populacji zabite
   ↓
depleted / eligible
   ↓
player pays 4 branches
   ↓
disabled
   ↓
14–30 dni
   + min. 2 osobniki gatunku w okolicy
   ↓
recovering
   ↓
active
```

Stan powinien być generyczny i niezależny od gatunku:

```ts
type SpawnPointState =
  | 'active'
  | 'depleted'
  | 'disabled'
  | 'recovering'
```

Nie implementować osobnych flag typu `isDeerSpawnDestroyed`.

### Stan `active`

- normalny respawn,
- limit populacji działa,
- śmierć przypisanego zwierzęcia zwiększa licznik strat danego spawn pointu,
- po przekroczeniu 50% początkowej/ustalonej populacji spawn point przechodzi do `depleted`.

### Stan `depleted`

- nie tworzyć nowych zwierząt ponad istniejący stan,
- spawn point nadal istnieje w świecie,
- interaction może pokazać możliwość `Zniszcz`,
- nie uruchamiać automatycznie kolejnego respawnu.

### Stan `disabled`

Po wykonaniu interakcji:

- spawn point przestaje generować zwierzęta,
- zapisuje czas rozpoczęcia regeneracji,
- pozostaje wizualnie spalony,
- istniejące zwierzęta nie są magicznie usuwane — świat reaguje tylko na faktyczne śmierci/odejście.

### Stan `recovering`

Po upływie okresu regeneracji:

- sprawdzić, czy w odpowiednim promieniu istnieją co najmniej 2 żywe osobniki tego samego gatunku,
- jeśli nie → pozostawić `disabled` i sprawdzać ponownie przy kolejnych dniach/odświeżeniu stanu,
- jeśli tak → przywrócić `active` i rozpocząć normalne zasiedlanie spawn pointu.

Okres regeneracji powinien być konfigurowalny, np. `14–30` dni. Na v1 wybrać jedną wartość domyślną, łatwą do późniejszego strojenia.

---

## 4. Jak liczyć „>50% populacji”

Nie opierać tego wyłącznie na chwilowym `nearby` count.

Spawn point powinien znać swój limit/populację referencyjną i liczbę osobników, które zginęły po aktywacji danego cyklu.

Przykład dla saren:

```text
limit = 6

0–3 deaths → active
4 deaths   → depleted / eligible
```

Ważne:

- śmierć musi być przypisana do konkretnego spawn pointu,
- jedno zwierzę nie może zostać policzone dwa razy,
- śmierć z dowolnego źródła (gracz, predator, potrzeby/lifecycle) powinna korzystać z istniejącego hooka śmierci,
- usunięcie/despawn bez śmierci nie powinno sztucznie zwiększać licznika zabitych.

Jeżeli istniejący lifecycle nie niesie jeszcze `spawnPointId`, rozszerzyć `AnimalAgent`/spawn path minimalnie tak, aby informacja była dostępna bez globalnego managera.

---

## 5. Przypisanie zwierzęcia do spawn pointu

Każde zwierzę wygenerowane przez spawn point powinno znać jego stabilną tożsamość, np.:

```ts
spawnPointId?: string
```

ID musi być deterministyczne dla danego świata/settlementu/pozycji/gatunku i nie może zależeć od kolejności runtime spawnu.

Nie wymagać osobnego `SpawnPointManager`.

Preferowane rozwiązanie:

- `PreySpawner` pozostaje właścicielem stanu spawn pointu,
- `AnimalAgent` przechowuje tylko `spawnPointId`,
- istniejący `Fauna`/`createFauna` przepina zdarzenie śmierci do właściwego spawnera,
- agregacja stanu pozostaje lokalna dla spawnera.

Jeżeli obecne ring spawny (`SPAWNS`) również są traktowane jako spawn pointy, zachować jedną semantykę identyfikacji zamiast tworzyć osobny mechanizm tylko dla cave/thicket/grove.

---

## 6. Interakcja „Zniszcz”

Dla spawn pointu w stanie `depleted` dodać istniejącym pipeline'em interaction nową akcję:

```text
[E] Zniszcz
```

Warunek:

- stan `depleted`,
- gracz ma co najmniej 4 gałęzie.

Po wykonaniu:

1. zużyć 4 gałęzie,
2. zmienić stan na `disabled`,
3. utworzyć duże ognisko w miejscu spawn pointu,
4. rozpocząć okres regeneracji,
5. uruchomić wizualne spalenie miejsca.

Nie tworzyć osobnego `SpawnPointInteractionSystem` — użyć istniejącego `Interactable` / handlera interakcji.

Jeżeli istniejący `VillageFire` jest ograniczony do ognisk osad, nie kopiować go bezpośrednio. W takim przypadku wydzielić z niego minimalny, wspólny mechanizm ognia możliwy do użycia przez światowe ognisko, bez przebudowy całego systemu.

---

## 7. Spalone miejsce

Po zniszczeniu spawn pointu miejsce powinno wyraźnie wyglądać na wypalone.

Minimalny efekt v1:

- duże ognisko,
- ciemniejszy obszar ziemi,
- kilka widocznych spalonych/suchych drzew lub istniejących propsów odpowiednio zmienionych,
- brak nowych zwierząt z tego punktu.

Preferować istniejące mechanizmy:

- `ChunkManager.modifyTerrain()` / istniejące modyfikacje terenu,
- istniejące drzewo/prop pipeline,
- istniejący system ognia.

Nie budować nowego ciężkiego systemu shaderów tylko dla jednego efektu.

Zmiana terenu ma być lokalna i tania. Nie deformować dużego obszaru świata.

---

## 8. Regeneracja i warunek lokalnej populacji

Po `14–30` dniach od zniszczenia:

```text
elapsedDays - disabledAtDay >= RECOVERY_DAYS
```

Następnie sprawdzać lokalną populację gatunku.

Minimalny warunek:

```text
nearby living animals of same kind >= 2
```

Promień sprawdzania powinien być powiązany z istniejącym `SPAWNER_RADIUS` lub inną istniejącą lokalną skalą spawnera, a nie definiowany arbitralnie w kilku miejscach.

Jeśli warunek jest spełniony:

- `disabled → recovering → active`,
- wyzerować licznik strat dla nowego cyklu,
- przywrócić normalny respawn zgodnie z limitem,
- zachować istniejące herd/mother mechanizmy.

Nie tworzyć sztucznie dwóch zwierząt tylko po to, aby spełnić warunek regeneracji.

---

## 9. Determinizm i wydajność

Mechanizm musi pozostać deterministyczny.

- brak `Math.random()` w logice stanu spawn pointu,
- recovery nie powinno być sprawdzane ciężkim skanem co klatkę,
- wykorzystać istniejące ticki/symulację czasu świata,
- stan spawn pointu aktualizować przy śmierci, interakcji i niskoczęstotliwościowym ticku recovery,
- nie wykonywać globalnego `O(spawners × animals)` co frame.

W szczególności nie zwiększać kosztu aktualizacji wszystkich zwierząt tylko dlatego, że spawn point otrzymuje lifecycle.

---

## 10. Poza zakresem

- ❌ pełna persystencja wszystkich zwierząt,
- ❌ migracja między spawn pointami,
- ❌ naturalna reprodukcja jako źródło populacji,
- ❌ dynamiczne wyznaczanie limitu na podstawie biomu,
- ❌ osobny globalny `SpawnPointManager`,
- ❌ osobny system AI spawn pointów,
- ❌ specjalne reguły tylko dla saren,
- ❌ rozbudowany system ekologicznej sukcesji po spaleniu.

Plan ma stworzyć prosty lifecycle spawn pointu, który później można rozszerzyć o naturalną dynamikę populacji.

---

## Kryteria akceptacji

1. 🦌 Każdy gatunek korzystający ze spawn pointów ma konfigurowalny limit populacji.
2. 🔢 Limit jest respektowany zarówno przy początkowym spawnie, jak i respawnie.
3. ☠️ Śmierć zwierzęcia jest przypisana do właściwego spawn pointu i nie jest liczona podwójnie.
4. ⚠️ Po śmierci >50% referencyjnej populacji spawn point przechodzi do `depleted`.
5. 🪵 W stanie `depleted` gracz może wykonać `Zniszcz`, jeśli ma 4 gałęzie.
6. 🔥 Interakcja zużywa 4 gałęzie i tworzy duże ognisko.
7. 🌑 Zniszczony punkt ma widoczny ślad spalenia na terenie.
8. 🚫 `disabled` nie generuje nowych zwierząt.
9. 🌱 Po skonfigurowanym okresie regeneracji punkt może wrócić do `active` tylko przy co najmniej 2 żywych osobnikach tego gatunku w okolicy.
10. 🐾 Mechanizm działa również dla innych gatunków bez kopiowania logiki per gatunek.
11. 🦌 Stada i młode z planu 118 respektują limit spawn pointu.
12. ⚡ Recovery i liczniki nie wprowadzają kosztu per-frame zależnego od liczby wszystkich zwierząt.
13. 🧪 `tsc`, lint, testy i build przechodzą.
14. 🌐 Wymagana jest weryfikacja w przeglądarce: normalny spawn, przekroczenie progu, `Zniszcz`, ognisko/spalenizna, brak respawnu i późniejsza regeneracja.

---

## Weryfikacja

Techniczna:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/play:

- sprawdzić kilka spawn pointów różnych gatunków,
- zweryfikować limit populacji,
- zabić wystarczającą liczbę zwierząt i potwierdzić przejście do `depleted`,
- wykonać `Zniszcz` mając 4 gałęzie,
- potwierdzić zużycie gałęzi i powstanie dużego ogniska,
- potwierdzić widoczny spalony teren,
- potwierdzić brak respawnu,
- przeskoczyć/odczekać okres regeneracji i sprawdzić warunek 2 osobników,
- potwierdzić ponowne aktywowanie spawn pointu bez błędów i bez nadmiernego namnażania.

Nie uznawać planu za zweryfikowany wyłącznie na podstawie testów TypeScript/build — wizualne spalenie i zachowanie spawn pointu wymagają browser/play check.

**Zrób git commit i push do main, rebase jeżeli trzeba**

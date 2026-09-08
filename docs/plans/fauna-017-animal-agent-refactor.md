# Plan: AnimalAgent refactor

**Created:** 2026-09-06
**Status:** `verification needed` 🔍
**Type:** refactor
**Priority:** medium · **Effort:** L
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `behavior` `lifecycle`
**Tags:** `AnimalAgent` `architecture` `refactor`
**Roadmap:** -

> Implementation landed on `main` 2026-09-08 (steps 1–11). Automated checks
> for the remaining steps (9–11) passed; steps 1–8 were already on `main`.
> Browser/manual verification (review §11, 12 points) is still the user's.

> **Faza 0 zakończona.** Review architektoniczny został wykonany 2026-09-08 i jest implementation
> discovery dla tego planu:
> [`docs/reviews/2026-09-03--AnimalAgent-refactor-review.md`](../reviews/2026-09-03--AnimalAgent-refactor-review.md)
> (commit `57af503d`). Werdykt: **REFACTOR**, effort **L** — dlatego `Effort` podniesiony z `M` do `L`,
> a `Status` z `draft` na `planned`. Ten plik jest wynikiem Fazy 1: przełożeniem przyjętych ustaleń
> review na konkretne kroki.
>
> Review jest źródłem szczegółów (numery linii, dowody, pełna mapa odpowiedzialności). Ten plan nie
> powtarza jego treści — podaje zakres, kolejność i kryteria akceptacji. Przed implementacją przeczytaj
> review w całości; kod repozytorium jest nadrzędny wobec obu dokumentów.

## Cel

Wydzielić z `src/fauna/AnimalAgent.ts` (4 865 linii) wyłącznie te odpowiedzialności, dla których review
wykazał realnego właściciela — istniejącego albo oczywiście brakującego — i naprawić trzy konkretne
defekty, które review udokumentował.

`AnimalAgent` ma pozostać centralnym punktem integracji jednego zwierzęcia. Docelowy rozmiar ~3 200
linii jest zamierzony, nie kompromisem.

## Stan obecny

Review ustalił, że **`AnimalAgent` nie jest drugim monolitycznym `NpcAgent`**. Warstwa decyzyjna jest już
poprawnie wydzielona: `faunaDecision.ts` to testowana tablica priorytetów (dokładnie wzorzec, który
review `NpcAgent` polecił skopiować do NPC), a `dogGuard.ts`, `preyAlertPerception.ts`,
`predatorHumanDecision.ts`, `playerAwareness.ts`, `waterTraversal.ts`, `herdCohesion.ts`,
`livestockProduction.ts`, `AnimalLife.ts`, `faunaCombat.ts`, `harvestedRemains.ts`, `corpseDecayFx.ts`
i `bloodSplat.ts` są wołane jako cienkie adaptery. 39 zaimportowanych modułów wobec 80 w `NpcAgent`.

Nie ma tu martwego szwu ani zdublowanej kolejności decyzji. **Nie tworzyć nowej architektury decyzyjnej
i nie dotykać `faunaDecision.ts`.**

Problem jest objętościowy i własnościowy w pięciu miejscach:

| Fakt (zweryfikowany na `main` `c7dd39f1`) | Wartość |
| --- | --- |
| Linie | 4 865 (456 → 4 865 w miesiąc, 92 commity) |
| Pola instancji | 91 |
| Linie przed `class AnimalAgent` | 1 506 (31 % pliku) |
| `ANIMAL_DEFS` + taksonomia gatunków | 640 linii czystych danych |
| Parametry pozycyjne konstruktora / `update()` | 19 / 21 |
| Najdłuższy ciąg `undefined` w call site | 8 (`settlement/rats.ts:232`) |
| Testy konstruujące `AnimalAgent` | **0** |

Dwa moduły prezentacji (`ui/agentStatusLabel.ts`'s `createAgentStatusLabelController`,
`shared/agentAnimationSet.ts`'s `createAgentAnimationSet`) powstały przy refaktorze `NpcAgent`,
**wymieniają `AnimalAgent` we własnym JSDoc** jako drugiego odbiorcę i wciąż nie są podłączone —
`docs/plans/LOOSE-ENDS.md:23`. Ryzyko 19/21 parametrów pozycyjnych jest śledzone w tym samym pliku
(`:30`) i ma udokumentowany precedens buga w `NpcAgent.update()`
(`docs/research/2026-09-01-npc-animal-threat-forwarding.md`).

## Defekty do naprawienia

Trzy, każdy jako osobny, opisany commit z testem. Poza nimi zachowanie zwierząt musi wyjść liczbowo
identyczne.

**D1 — drapieżnik ginący z claimem na padlinie blokuje ją do końca jej życia.** `cancelSourceTarget()`
to jedyna ścieżka zwalniająca `foodClaimedBy`, a ani `collapse()`, ani `dispose()` jej nie wołają;
`update()` wraca wcześniej dla martwego agenta. Padlina zostaje niedostępna dla każdego innego
drapieżnika przez resztę swojego linger (do 60 s), co wycina cały tier padlinożerstwa z fauna-005
dokładnie w sytuacji, która produkuje najwięcej padliny (osada pod presją wilków, psy zabijające wilki).

**D2 — `driveMounted()` przepisał ogon `update()` ręcznie i już się rozjechał.** Dosiadane zwierzę
w nocy zużywa głód/pragnienie 2× szybciej niż wolne (`{}` zamiast `hungerThirstRate: 0.5`), a osiem
timerów cooldown/one-shot w ogóle nie tyka podczas jazdy — więc trafiony wierzchowiec zamarza na klatce
animacji obrażeń aż do zsiadania. `this.isNight` jest ustawiane *po* wcześniejszym `return` dla
`mounted`, więc jest nieaktualne i nie da się go po prostu użyć.

**D3 — `resolveTimeSkip()` nie posuwa dojrzewania młodych.** `age` jest zwiększane wyłącznie przez
`tickMaturity()` wewnątrz `update()`, a `update()` jest wyłączone na czas skipu (plan 196). Narusza
inwariant „time-skip follows the same simulation semantics as normal progression". Wzorcem poprawnym
jest `livestockProduction.ts` — kotwica w dniach, leniwe porównanie, brak catch-upu.

## Zakres

Cztery nowe moduły, dwa istniejące moduły współdzielone rozszerzone, dwa istniejące moduły fauny
dostają z powrotem swoje stałe.

```text
src/fauna/
  AnimalAgent.ts          4 865 → ~3 200
  animalDefs.ts           NEW  ~660   taksonomia gatunków + ANIMAL_DEFS + diety + etykiety
  animalCorpse.ts         NEW  ~330   maszyna stanów zwłok/szczątków/rozkładu/ekspozycji wścieklizny/claimów
  animalForaging.ts       NEW  ~380   wybór/walidacja/konsumpcja źródła + scoring padliny
  animalRoaming.ts        NEW  ~150   maszyna stanów wypraw + wspólny radial probe
  dogGuard.ts             +30         własne 6 stałych tuningowych
  preyAlertPerception.ts  +10         PREY_ALERT_RANGE_BONUS
src/shared/
  agentAnimationSet.ts    +8          dopasowanie `Armature|Name` w resolve()
src/world/
  animalTraps.ts          import AnimalKind z animalDefs.ts (rozrywa cykl)
```

Pełne tabele plików do utworzenia/modyfikacji: review §9.

## 1. `animalDefs.ts` — dane gatunków

Przenieś taksonomię i dane (`AnimalKind`/`AnimalRole`/`AnimalSociability`/`AnimalLifeStage`,
`ANIMAL_LABELS`, `AnimalDef` z sześcioma sub-configami, `HERBIVORE_DIET`, `MEAT_DIET`,
`dietAcceptsItem`, `ANIMAL_DEFS`, stałe roamingu/wypraw) do `src/fauna/animalDefs.ts`.

Re-eksportuj **każdy** przeniesiony symbol z `AnimalAgent.ts`, żeby żaden z 49 importerów nie wymagał
edycji. Przekieruj import `AnimalKind` w `world/animalTraps.ts` na nowy moduł — to rozrywa jedyny cykl
importów, jaki dziś istnieje (`AnimalAgent.ts` ↔ `world/animalTraps.ts`).

**Kryterium akceptacji:** −640 linii, `git diff` poza importami/re-eksportami pusty, `npx tsc --noEmit`
i `pnpm run test` zielone.

## 2. `AnimalAgentDeps` + `AnimalUpdateContext`

Konstruktor → `constructor(deps: AnimalAgentDeps)`, `update()` → `update(ctx: AnimalUpdateContext)`.
Wzorzec: `CreateSettlementDeps` (`settlement/createSettlement.ts`) i `NpcAgentDeps` (`ai/NpcAgent.ts`) —
oba już w repo, skopiuj ich kształt zamiast wymyślać własny.

Osiem call sites: `settlement/livestock.ts:166`, `:517`, `:570`, `:659`; `settlement/rats.ts:149`,
`:232`; `fauna/createFauna.ts:648`, `:953`. Usuń każdy placeholder `undefined`.

Konwersję rób **mechanicznie** — nie zmieniaj kolejności, nazw ani wartości domyślnych przy okazji.
Kompilator złapie wszystko poza dwoma polami tego samego typu zamienionymi miejscami, więc ręcznie
sprawdź dwie grupy: `ownerHouseId`/`herdId`/`motherId`/`spawnPointId` (wszystkie `string | undefined`)
oraz `nearbyNpcs`/`nearbySettlementNpcs` i `nearbyPredators`/`nearbyRats`.

**Ten krok odblokowuje testowalność klasy** — bez niego kroki 5–7 są „przeniesione i mam nadzieję".
Odhacz `docs/plans/LOOSE-ENDS.md:30`.

## 3. Wspólny ogon ticku + naprawa D2

Jedna prywatna metoda `tickPresentationAndLife(dt, observerPos, hungerThirstRate)` wołana przez
`update()` i `driveMounted()`. Przenieś do niej osiem dekrementacji timerów oraz `tickMaturity`/
`tickProduction`. `driveMounted` potrzebuje `dayFactor` (albo rozstrzygniętego `isNight`) z call site
systemu jazdy, bo `this.isNight` jest podczas jazdy nieaktualne.

`clampBounds()` zostaje **poza** wspólnym helperem — to jedyna udokumentowana, zamierzona różnica
(dosiadane zwierzę musi móc opuścić swój promień home).

Zamierzone efekty: dosiadane zwierzę w nocy dostaje tę samą stawkę 0.5; timery tykają, więc animacja
trafionego wierzchowca wraca do normy; `labelDistanceState` aktualizuje się podczas jazdy.

**Diff musi być przejrzany linia po linii wobec obu obecnych ogonów.**

## 4. Prezentacja — podłączenie istniejących właścicieli

### 4a. Warunek wstępny (nie pomijać)

`createAgentAnimationSet.resolve()` porównuje nazwy klipów dokładnie; `AnimalAgent.findAction()`
akceptuje też formę `Armature|Walk`, którą paczki Farm Animals (cow/sheep) realnie eksportują.
Rozszerz `resolve()` o dopasowanie sufiksu `|<name>` (case-insensitive) i dodaj test.

**Bez tego kroku podłączenie w 4b po cichu zabije animacje krowy i owcy** — `null` jest w tej klasie
udokumentowanym, cichym no-opem, więc nic nie rzuci wyjątku ani nie zaloguje. To jedyne ryzyko cichej
awarii w całym planie.

### 4b. `createAgentAnimationSet`

Klucze: `'idle' | 'walk' | 'gallop' | 'attack' | 'hurt' | 'death'`. Usuń `findAction`/`playAction`/
`playOneShotAnim` i 9 pól. `updateAnim` staje się trzema wywołaniami `anim.play(...)`. `hydrate()`
używa `settleAtEnd('death')` tam, gdzie gatunek ma klip śmierci. `deathAnimDurationSec`/
`attackAnimTimer`/`hurtAnimTimer` zostają na agencie — bramkują symulację, nie prezentację.

### 4c. `createAgentStatusLabelController`

Paski `['hp','stamina','satiety','hydration']`. Satiety/hydration to odwrócone potrzeby — podawaj
`{ current: 1 - hunger, max: 1 }`. `markDangerous`/`setHighlighted`/`harvestMeat` sięgają po
`controller.el`, `tickMaturity` po `controller.label`, `collapse`/`hydrate` po `settleAtZeroHp()`.
Kontroler zasiewa każdy pasek na 100 %, więc satiety/hydration są poprawne od pierwszego `sync()`,
a nie od konstrukcji — różnica kosmetyczna, jedna klatka.

13 pól etykiety → 1, 9 pól animacji → 1. Zduplikowany 22-linijkowy blok pasków znika jednocześnie
z `update()` i `driveMounted()`. Odhacz częściowo `docs/plans/LOOSE-ENDS.md:23` (`PlayerController`
zostaje otwarty).

## 5. `animalCorpse.ts` — maszyna stanów zwłok

Przenieś ~250 linii cyklu życia zwłok plus `claimAsFood`/`releaseFoodClaim`/`markFoodConsumed` i 10
stałych. Kształt: zwykły stan + wolne funkcje nad jawnym hostem, dokładnie tak, jak `AnimalLife.ts`
posiada `AnimalLifeState` nie posiadając zwierzęcia. **To nie ma być drugi byt.**

`AnimalAgent` zachowuje każdą metodę publiczną jako cienki delegat, więc kształt wywołań między
agentami (`findCarcassTarget`, `isSourceTargetValid`) nie zmienia się wcale. `health.dead` pozostaje
autorytatywne na agencie. `snapshot`/`hydrate` zostają na agencie i czytają/piszą pola stanu zwłok.

Kontrakt „unieważnij token przed `await`" (`spawnHarvestedRemains`, `spawnNaturalRemains`,
`spawnDeathSplat`) musi przetrwać przenosiny bez zmian — to on chroni przed doczepieniem nieaktualnego
klona do zdysponowanego mesha.

## 6. `animalForaging.ts` — wybór źródeł, potem naprawa D1

### 6a. Przeniesienie (bez zmiany zachowania)

Przenieś selektory, walidację i konsumpcję (~280 linii) plus 13 stałych. `AnimalAgent` zachowuje
`pursueNeeds`/`pursueSourceTarget`/`cancelSourceTarget` — one sterują `setIntent`/`steerToward`.

Do padliny użyj **interfejsu strukturalnego** (`CarcassCandidate`), nigdy importu wartości `AnimalAgent`
— to ta sama technika, którą stosują już `pickRabidTarget` i `resolveDogGuardTarget`, i produkcja
przekazuje realną tablicę bez alokacji.

Wszystkie pięć ramion `performSourceAction` przyznaje ulgę **wyłącznie** po udanej operacji atomowej
(`household.water.remove`, ponowny odczyt `carcassFoodValue`, `household.items.remove` dokładnie
wybranego rodzaju, `grassForage.consume`). Przenieś każde ramię jako całość i napisz test „raced source
grants no relief" dla każdego z czterech, **zanim** dotkniesz call site.

### 6b. Naprawa D1 (osobny commit)

Wołaj `cancelSourceTarget()` z `collapse()` i `dispose()`.

## 7. `animalRoaming.ts` — wyprawy i wspólny probe

Przenieś maszynę stanów wyprawy (`AnimalTrip`, `tripDayBucket`, logikę commitowania,
`findWaterTripDestination`). Wprowadź `probeBestPointNear(center, radius, attempts, accept, score,
random?)` i przepisz na nim `findWaterTarget`, `findForageTarget` i wyszukiwanie celu wyprawy — trzy
kopie tej samej pętli.

**Każda z trzech zachowuje swój własny predykat i swoją metrykę co do bajtu** (`hits * 10 - d` dla
wody i wyprawy, `suitability * 10 - d` dla forage).

`wander()`, sterowanie w `continueTrip()`, `pickWanderTarget()` i `pickFollowTarget()` zostają na
agencie — czytają stan stada/matki, który należy do agenta.

## 8. Porządek w switchu `update()`

Jedna metoda `resetHumanThreatState()` zamiast sześciu kopii tego samego czteropolowego resetu.
Jeden helper `logNpcThreatBranch(...)` w `debug/` zamiast czterech niemal identycznych bloków
`console.log` — przy okazji **napraw defekt copy-paste**: wszystkie cztery drukują
`` `npcThreat=${npcThreat!.id}/${npcThreat!.id}` `` (to samo id dwa razy; w drugim slocie miało być
`homeId`).

Ujednolić `cancelSourceTarget()` per gałąź, zachowując **nietkniętą** zamierzoną asymetrię
`npc-attack-frenzied` wraz z jej komentarzem i dopisując analogiczny do `frenzy-beeline`.

Przed ekstrakcją wypisz, które gałęzie wołają dziś reset, i sprawdź, że po refaktorze zbiór wywołań
jest identyczny. **Nie dodawaj resetu do gałęzi, która go dziś nie ma.**

## 9. Stałe do swoich właścicieli + alokacje

Sześć stałych psich do `dogGuard.ts`, `PREY_ALERT_RANGE_BONUS` do `preyAlertPerception.ts`.

Przy okazji usuń alokacje per-tick w czterech call sites (`resolveAlertThreat` — największe źródło,
alokuje tablicę kandydatów i literał na kandydata dla **każdego prey/domestic zwierzęcia w każdym
ticku**; `resolveGuardTarget`, `updateDogVocalization` i `pursuePest` — po `.map()`/`.filter()` na psa
na tick). Wzorzec do skopiowania jest w tym samym pliku: `resolveLureTarget` jest udokumentowane jako
„pure and allocation-free".

Zmierz przed i po przez `perf/agentCpuDiag` (opakowuje już cały fauna pass w `createFauna.ts`).

## 10. Dojrzewanie w time-skip (D3)

Wyciągnij ciało `tickMaturity()` do `advanceAge(seconds)` i wołaj je zarówno z `update()`, jak
i z `resolveTimeSkip()`.

## 11. Dokumentacja

- `docs/state/fauna.md`: nowe granice modułów; **zawęź zdanie** „traversability can never diverge
  between free-roaming and ridden movement" do `isWalkable` (reszta ogona ticku tego nie gwarantowała —
  patrz D2); uzupełnij brakujący opis fauna-011 (psy), zgłoszony w `LOOSE-ENDS.md:21`.
- `docs/CODE_INDEX.md`: ręczne wiersze routingu dla nowych modułów, potem `pnpm docs:sync`.
- `docs/plans/LOOSE-ENDS.md`: odhacz `:23` (częściowo) i `:30`; dopisz dwie notatki o losowości
  dotykającej stanu persystowanego (review §P9: `hydrate()`'s tip side losuje **przy wczytaniu**
  persystowanych zwłok livestocku; `tickProduction()`'s stagger zasiewa persystowane
  `productionReadyAtDays`).

## Kolejność i uzasadnienie

```text
1 animalDefs  ──┐
                ├─→ 3 wspólny ogon ─→ 4a suffix ─→ 4b anim ─→ 4c label
2 deps      ────┘                                     │
     │                                                 │
     └─→ testowalność klasy ─→ 5 corpse ─→ 6a foraging ─→ 6b D1
                              └─→ 7 roaming
                                          8 switch ─→ 9 stałe/alokacje ─→ 10 D3 ─→ 11 docs
```

Kroki 1 i 2 idą pierwsze, bo odblokowują resztę; 2 dodatkowo czyni klasę konstruowalną w teście po raz
pierwszy. 3 przed 4, bo dotykają tego samego ogona. 5, 6 i 7 są od siebie niezależne. 8 na końcu wśród
kroków kodowych, bo jako jedyny czyta się jak zmiana zachowania.

## Testy

Automatyczne po **każdym** kroku:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build          # kroki 2, 3 i 4 — te dotykają wiring Three.js/DOM
```

Nowe pokrycie, którego ten refaktor musi dostarczyć (szczegółowe asercje: review §11):

| Plik | Kluczowe asercje |
| --- | --- |
| `src/fauna/AnimalAgent.test.ts` (nowy, `// @vitest-environment jsdom`) | konstrukcja przez capsule fallback z `AnimalAgentDeps`; tick mounted i wolny stosują **tę samą** nocną stawkę głodu (D2); `resolveTimeSkip(8 h)` dojrzewa młode (D3) |
| `src/fauna/animalCorpse.test.ts` | przejścia faz; harvest tylko `fresh`; bury trwale zatrzymuje rozkład; wpływ rozkładu ograniczony promieniem i fazą; ekspozycja wścieklizny najwyżej raz na parę; claim → consume → ponownie claimowalne po zmianie fazy |
| `src/fauna/animalForaging.test.ts` | trough przed brzegiem; pusty trough bez ulgi; feed usuwany dokładnie wybranym rodzajem; przegrany wyścig o grass patch bez ulgi; padlina zdegradowana poza tier jedzącego odrzucana przy zakończeniu; **padlina po martwym drapieżniku znów wybieralna (D1)** |
| `src/fauna/animalRoaming.test.ts` | `probeBestPointNear` respektuje `accept` i wybiera najlepszy `score` przy wstrzykniętym `random`; każda z trzech dawnych pętli zachowuje swoją metrykę; fazy wyprawy |
| `src/shared/agentAnimationSet.test.ts` | `Armature\|Walk` rozwiązuje się dla nazwy `'Walk'` (4a); dopasowanie dokładne nadal wygrywa z sufiksowym |

Przekierować istniejące: `foodWaterTargeting.test.ts` → `animalForaging.ts`, `corpseDecay.test.ts` →
`animalCorpse.ts`, `animalRoamingTrips.test.ts` → `animalRoaming.ts`/`animalDefs.ts`.

Kontrola nie-regresji: `git diff --stat` per krok pokazuje **wyłącznie** pliki wymienione dla tego kroku
w review §9.

## Manual verification

Wykonuje użytkownik, nie agent. Pełna lista 12 punktów: review §11. Punkty krytyczne:

1. **Dane gatunków (krok 1)** — każdy gatunek ma nadal swój model, skalę, etykietę, prędkości i pasmo
   roamingu; sarny/jelenie nadal robią wyprawy do wody.
2. **Call sites (krok 2)** — dzika fauna, livestock i szczury nadal spawnują się, tikają i znikają; pies
   pilnuje, szczeka i goni szczury; kura znosi; krowę da się wydoić. To krok najbardziej podatny na
   ciche zamienienie dwóch argumentów.
3. **D1 (krok 6b)** — wilk zajmuje świeżą padlinę, zabij go przed końcem jedzenia, drugi wilk musi
   podjąć tę samą padlinę. Przed poprawką nie podejmie przez ~60 s.
4. **D2 (krok 3)** — przejedź się konno od zmierzchu przez noc i porównaj paski sytości/nawodnienia
   z koniem stojącym w osadzie; powinny opadać tak samo. Potem uderz wierzchowca w trakcie jazdy
   i sprawdź, że animacja chodu wraca zamiast zamarzać.
5. **D3 (krok 10)** — znajdź młodą sarnę, zrób skip 8 h, sprawdź rozmiar dorosłego i brak podążania
   za matką.
6. **Prezentacja (krok 4)** — **krowa i owca muszą nadal odtwarzać klip chodu** (ryzyko R1). Do tego
   paski, dystans ukrywania pasków, cienie, klip obrażeń, klip śmierci, gatunki bez klipu śmierci
   (owca/kura/niedźwiedź) nadal się przewracają.
7. **Wydajność (krok 9)** — panel agent CPU (`?debug=1`) wobec pomiaru sprzed refaktoru na tym samym
   seedzie, przy kilku psach i osadzie pełnej livestocku.

## Ryzyka

Pełna lista dziewięciu z mitygacjami: review §10. Trzy najważniejsze:

- **R1 (krok 4b)** — ciche zabicie animacji krowy/owcy. Mitygacja: 4a wchodzi pierwszy, z testem;
  przed 4b wypisz w commit message, które paczki eksportują nazwy z prefiksem.
- **R3 (krok 2)** — szeroki, semantycznie pusty diff. Mitygacja: osobny commit, bramka
  `npx tsc --noEmit` + `pnpm run build`, ręczna kontrola dwóch grup pól tego samego typu.
- **R4 (krok 6a)** — kontrakty rewalidacji muszą przenieść się dosłownie; pomyłka daje darmowe
  jedzenie/wodę, czego dziś żaden test nie wykryje.

## Persystencja

`AnimalSaveState` nie zmienia się w żadnym kroku. **Bez bumpu `CURRENT_SAVE_VERSION`, bez migracji.**
`snapshot`/`hydrate` zostają na `AnimalAgent` także po kroku 5. Jeśli któryś krok wygląda, jakby
potrzebował bumpu — wyszedł poza zakres.

## Non-goals

- Zmiana **jakiegokolwiek** zachowania zwierząt poza D1, D2 i D3. Promienie, progi, priorytety,
  obrażenia, cooldowny, pasma roamingu, polityki wypraw, zasięgi detekcji i szanse reakcji muszą wyjść
  liczbowo identyczne.
- Uczynienie wyszukiwania celów ruchu deterministycznym. `docs/state/fauna.md` opisuje obecną politykę
  i dlaczego się broni; zmiana jest powiązana z pytaniem o persystencję dzikiej fauny (fauna-018).
  Dwie notatki do `LOOSE-ENDS.md` (krok 11) zamiast zmiany.
- Rozstrzyganie dwupoziomowej asymetrii zachowań (głód/pragnienie nigdy nie konkurują w tablicy
  priorytetów). To udokumentowana własność projektowa; krok 6 czyni tę kolejność widoczną i testowalną,
  decyzja należy do osobnego planu `fauna-###`.
- Podział `AnimalAgent` na wiele klas (`AnimalBrain`/`AnimalMovement`/…) — jawnie odrzucone, review §4.
- Village-exclusion-once-locked w `resolveNpcTarget` (`LOOSE-ENDS.md:28`) — znana, zaakceptowana
  kwestia zachowania.
- Podłączenie `PlayerController` do modułów prezentacji — `LOOSE-ENDS.md:23` zostaje w tej części
  otwarty, żeby ewentualna regresja była przypisywalna do jednego agenta.
- Płaska tablica obrażeń fauny wobec współdzielonego pipeline'u critical/defense — plan combatu.
- Lokalizacja szczurów/livestocku w `src/settlement/`, `AnimalSpawner`/`createFauna` internals,
  persystencja dzikiej fauny (fauna-018), jaskiniowe habitaty (fauna-019).

## Wariant M

Gdyby plan miał zostać przy `Effort: M`, bronialnym podzbiorem są **kroki 1–4** (~700 przeniesionych
linii, obiekty deps, ujednolicony ogon ticku i podłączenie prezentacji). Dostarcza oba śledzone punkty
z `LOOSE-ENDS.md` i naprawia D2; kroki 5–10 idą wtedy do osobnego planu follow-up.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

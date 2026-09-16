# Plan: Profession-linked family surnames and NPC need-marker cleanup

**Created:** 2026-09-16
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `settlements-npcs`  
**Type:** `polish`  
**Roadmap:** -

## Cel

Poprawić czytelność i charakter NPC bez tworzenia równoległych systemów:

1. usunąć kolorowe kule nad głowami NPC, które obecnie wizualizują `activeNeed` / aktywność,
2. sprawić, aby proceduralne nazwiska rodzin były inspirowane profesją jednego z dorosłych członków rodziny,
3. zachować istniejącą własność nazwiska przez rodzinę, deterministyczność worldgenu oraz zgodność form żeńskich dla polskich nazwisk.

## Stan obecny

### Need marker

`src/ai/NpcAgent.ts` tworzy i aktualizuje `needMarker` jako małą kolorową kulę nad NPC. Marker reaguje na zmianę `activeNeed`, ale nie jest źródłem stanu potrzeb ani decyzji — jest wyłącznie warstwą prezentacji.

Usunięcie markera nie może usuwać ani zmieniać `activeNeed`, pressure/decision logic, pracy, potrzeb ani etykiet tekstowych NPC.

### Nazwiska

Aktualny ownership:

```text
generateFamilies()
  -> rodzina dostaje wspólne nazwisko
  -> surnameForGender() formatuje wariant per płeć
  -> resolveInitialProfessionStaffing()
  -> role dorosłych może zostać zmienione
  -> createVillagePlan()
```

Istotne konsekwencje:

- nazwisko jest własnością rodziny, nie pojedynczego NPC,
- małżonkowie i dzieci dzielą rodzinne nazwisko,
- ostateczna profesja części proceduralnych dorosłych jest znana dopiero po `resolveInitialProfessionStaffing()`,
- nie należy wybierać nazwiska bezpośrednio w `generateFamily()` na podstawie początkowego `characterForSeed()`, ponieważ staffing może później zmienić rolę,
- authored/specialist residents używani przez questy mają własną tożsamość i nie mogą być automatycznie przemianowywani przez ten mechanizm.

## Zakres

### 1. Usunąć kolorowe kule nad NPC

W `src/ai/NpcAgent.ts` usunąć wyłącznie warstwę wizualną need markera:

- współdzieloną `SphereGeometry` używaną tylko przez marker,
- per-NPC mesh/material markera,
- dodawanie markera do sceny/modelu,
- cache typu `lastNeedMarkerNeed`, jeśli po usunięciu markera nie ma innych użytkowników,
- aktualizację koloru na zmianę `activeNeed`,
- cleanup/dispose dotyczący wyłącznie markera.

Nie usuwać ani nie upraszczać:

- `activeNeed`,
- potrzeb i pressures,
- decision/action logic,
- schedule/work state,
- tekstowych etykiet/statusów, jeśli mają inne źródło i zastosowanie.

### 2. Zachować nazwisko jako własność rodziny

Nie wprowadzać modelu `NPC role -> indywidualne nazwisko`.

Docelowo:

```text
staffed family
  -> wybór reprezentatywnej profesji rodziny
  -> deterministyczny wybór z puli nazwisk tej profesji
  -> jedno bazowe nazwisko rodziny
  -> surnameForGender() dla poszczególnych członków
```

Dzięki temu np. kowal może należeć do rodziny Kowalskich, a jego żona lub dzieci zachowują to samo nazwisko niezależnie od własnej roli.

### 3. Moment przypisania profesyjnego nazwiska

Profesjonalne nazwisko należy zastosować **po** `resolveInitialProfessionStaffing()` i **przed** `createVillagePlan()` / materializacją runtime NPC.

Preferowany flow w `src/settlement/settlementGenerator.ts`:

```text
generateFamilies()
-> appendAuthoredResidentFamilies(...)
-> resolveInitialProfessionStaffing(...)
-> applyProfessionFamilySurnames(...)
-> createVillagePlan(...)
```

Nie zmieniać odpowiedzialności `resolveInitialProfessionStaffing()` — staffing nadal tylko ustala profesje.

### 4. Nowy helper dla profesyjnych nazwisk rodzin

Preferowany plik:

`src/settlement/professionFamilySurnames.ts`

Powinien posiadać jeden mały, deterministyczny mechanizm oparty o istniejące `Role`, `FamilyDef`, `NpcGender`, `surnameForGender()` i `createSeededRandom()`.

Przykładowy kontrakt:

```ts
applyProfessionFamilySurnames(
  families: readonly FamilyDef[],
  settlementSeed: number,
): FamilyDef[]
```

Helper:

- nie mutuje wejściowych rodzin w miejscu,
- zachowuje wszystkie istniejące dane członków poza `lastName` / `character.lastName`,
- dla rodziny ustala jedną `surnameRole`,
- wybiera jedno bazowe nazwisko z puli tej roli,
- aktualizuje `FamilyMember.lastName` i odpowiadające `FamilyMember.character.lastName`,
- używa istniejącego `surnameForGender()` do polskich wariantów `-ski/-ska`, `-cki/-cka`,
- używa osobnego saltu RNG, aby dodanie lub zmiana puli nazwisk nie reshufflowała profesji, wieku, imion, layoutu ani innych systemów.

### 5. Wybór profesji reprezentującej rodzinę

Rodzina może mieć kilku dorosłych o różnych rolach. Nie wybierać po prostu pierwszego elementu tablicy.

Użyć jawnego priorytetu ról rodzinnych:

```text
blacksmith
hunter
fisher
miner
woodcutter
herbalist
shepherd
textile_worker
trader
guard
farmer
```

Cel: specjalistyczna profesja ma większą siłę identyfikacyjną niż ogólna rola żywnościowa.

Reguły:

- brać pod uwagę tylko dorosłych (`isAdultAge()`),
- wybrać najwyżej sklasyfikowaną rolę obecną w rodzinie,
- przy wielu dorosłych z tą samą rolą wynik jest taki sam,
- dzieci nigdy nie wybierają profesji nazwiska,
- jeżeli z jakiegoś powodu brak dorosłego, zachować istniejące nazwisko zamiast zgadywać.

Priorytet jest częścią danych/configu helpera, nie rozproszonym `if` w generatorze.

### 6. Pule nazwisk per profesja

Nowe pule są wspólne dla profesji i nie są kolejną `NameCulture`. Używać głównie polskich, angielskich i łatwo rozpoznawalnych form łacińskich; nie dodawać nowych hiszpańskich nazwisk do tych pul.

```ts
const ROLE_SURNAME_POOLS: Record<Role, readonly string[]> = {
  guard: [
    'Hornblower', 'Ward', 'Shields', 'Guard', 'Sentinel', 'Watchman',
  ],
  woodcutter: [
    'Leśniewski', 'Woodward', 'Forester', 'Sawyer', 'Greenwood', 'Timber',
  ],
  blacksmith: [
    'Kowalski', 'Smith', 'Schmidt', 'Ferrarius', 'Steel', 'Forge',
  ],
  farmer: [
    'Rolnik', 'Farmer', 'Fields', 'Meadows', 'Granger', 'Agricola',
  ],
  hunter: [
    'Łowicki', 'Hunter', 'Fletcher', 'Archer', 'Venator', 'Lupus',
  ],
  fisher: [
    'Rybak', 'Fisher', 'Fischer', 'Rivers', 'Waters', 'Angler',
  ],
  miner: [
    'Górski', 'Miner', 'Stone', 'Rockwell', 'Bergmann', 'Montanus',
  ],
  trader: [
    'Kupiec', 'Merchant', 'Mercer', 'Chandler', 'Booker', 'Trader',
  ],
  shepherd: [
    'Owczarek', 'Shepherd', 'Shepard', 'Schäfer', 'Flock', 'Pastor',
  ],
  textile_worker: [
    'Tkacz', 'Weaver', 'Taylor', 'Webber', 'Mercer', 'Textor',
  ],
  herbalist: [
    'Zieliński', 'Green', 'Sage', 'Herbal', 'Sylvan', 'Herbarus',
  ],
}
```

`Record<Role, ...>` ma być celowo zamknięty — dodanie nowej profesji powinno wymusić decyzję o jej puli przy kompilacji.

Jeżeli podczas implementacji któreś nazwisko okaże się mylące językowo lub zbyt sztuczne, można je zastąpić nazwiskiem w tym samym stylu bez zmiany architektury planu.

### 7. Reserved home families

Dwie obecne quest-critical rodziny startowe mają zachować stabilną tożsamość i wspólne rodzinne nazwiska, ale dostać bardziej charakterystyczne formy:

```text
Piotr (woodcutter) + Anna (farmer)
-> Leśniewski / Leśniewska

Marek (guard) + Kasia (trader)
-> Hornblower
```

Zaktualizować `RESERVED_CHARACTERS` w `src/ai/characters.ts` oraz testy/fixture'y, które na sztywno oczekują `Kowalski/Kowalska` lub `Wiśniewski/Wiśniewska` dla tych czterech NPC.

Nie zmieniać ich imion, ról, traits ani questowego dopasowania po `name`.

### 8. Authored i specialist residents — guardrail

`applyProfessionFamilySurnames()` nie może automatycznie nadpisywać nazwisk rodzin dodawanych przez mechanizmy authored residents, np. Lost Treasure Chronicles.

Mechanizm ma działać tylko dla rodzin worldgenowych:

- `family-${index}`,
- `family-reserved-${index}`.

Rodziny o innych stabilnych/authored `family.id` zachowują nazwiska nadane przez ich własny system.

Nie wprowadzać listy questów do helpera — filtrować po ownershipie/rodzaju rodziny, nie po nazwach konkretnych questów.

### 9. `NameCulture` pozostaje istniejącym mechanizmem imion

Nie usuwać ani nie przebudowywać w tym planie istniejących `NameCulture`, `NAME_POOLS`, `SURNAME_POOLS` czy migracji nazw w całym świecie poza tym, co jest konieczne do podłączenia profesyjnych nazwisk.

Profesjonalne pule nazwisk są world-flavor i nie zależą od kultury imienia NPC.

To oznacza, że istniejący system może nadal generować imiona według kultury osady, natomiast proceduralna rodzina po staffing dostaje nazwisko powiązane z profesją.

Usunięcie lub przebudowa istniejącej kultury `spanish` jest poza zakresem tego planu.

## Istotne pliki

### Zmiany wymagane

- `src/ai/NpcAgent.ts`
  - usunięcie wizualnego `needMarker`.

- `src/ai/characters.ts`
  - nowe nazwiska dwóch reserved home families.

- `src/settlement/professionFamilySurnames.ts` — nowy
  - role priority,
  - `ROLE_SURNAME_POOLS`,
  - family-level deterministic surname selection,
  - aktualizacja obu miejsc przechowujących nazwisko członka (`FamilyMember.lastName`, `character.lastName`).

- `src/settlement/settlementGenerator.ts`
  - wywołanie helpera po `resolveInitialProfessionStaffing()` i przed dalszą materializacją.

### Testy

Preferowane:

- `src/settlement/professionFamilySurnames.test.ts` — nowy,
- istniejące testy reserved characters / family generation / authored residents tylko tam, gdzie obecne assertions wymagają aktualizacji.

Nie wykonywać szerokiego przepisywania fixture'ów, jeżeli nazwisko w danym teście jest wyłącznie nieistotnym przykładem lokalnym.

## Testy automatyczne

Dodać przypadki obejmujące co najmniej:

1. ta sama worldgenowa rodzina dostaje jedno wspólne bazowe nazwisko,
2. `Leśniewski -> Leśniewska` i `Kowalski -> Kowalska` przez istniejące `surnameForGender()`,
3. ten sam `settlementSeed` i ten sam staffed roster dają identyczne nazwiska,
4. różny seed może wybrać inne nazwisko z tej samej puli,
5. rodzina z kowalem wybiera pulę `blacksmith` mimo obecności np. farmera,
6. rodzina z drwalem i farmerem wybiera pulę `woodcutter`,
7. dzieci dziedziczą nazwisko rodziny i nie wpływają na wybór `surnameRole`,
8. rodzina bez dorosłego zachowuje dotychczasowe nazwisko,
9. authored/specialist family nie jest przemianowywana,
10. reserved Piotr + Anna mają `Leśniewski/Leśniewska`,
11. reserved Marek + Kasia mają `Hornblower`,
12. usunięcie `needMarker` nie usuwa ani nie zmienia `activeNeed` / wyboru działań; istniejące testy logiki NPC nadal przechodzą.

## Weryfikacja implementacji

Uruchomić odpowiednie unit testy dla:

- `professionFamilySurnames`,
- `families`,
- `professionStaffing`,
- quest/materialization testów dotykających reserved NPC lub authored residents,
- testów `NpcAgent`, jeśli istnieją przypadki obejmujące marker/need presentation.

Następnie standardowy typecheck/build zgodnie z repo.

Manualna weryfikacja w przeglądarce należy do użytkownika:

- brak kolorowych kul nad NPC podczas pracy, pragnienia, zbierania itd.,
- `Piotr Leśniewski`, `Anna Leśniewska`, `Marek Hornblower`, `Kasia Hornblower`,
- proceduralne rodziny mają nazwiska semantycznie powiązane z profesją,
- małżonkowie/dzieci nadal wyglądają jak jedna rodzina nazwiskowo,
- authored quest NPC zachowują własne nazwiska.

## Non-goals

- zmiana potrzeb, pressures, decyzji lub AI NPC,
- dodawanie ikon aktywności w miejsce kul,
- indywidualne nazwiska zależne od zawodu każdego członka rodziny,
- przebudowa `NameCulture`,
- usunięcie istniejącej kultury hiszpańskiej z imion,
- zmiana questowego identity matching,
- nowe persistence fields — nazwiska nadal są deterministyczne z worldgenu/tożsamości rodzinnej,
- zmiana staffing policy lub liczby profesji w osadzie.

## Guardrails

- rozszerzyć istniejący system rodzin i nazwisk; nie tworzyć osobnego identity store,
- nazwisko pozostaje family-owned,
- nie konsumować istniejących strumieni RNG odpowiedzialnych za family composition, roles, traits, names, ages lub world layout,
- nie nadpisywać authored residents,
- nie używać runtime camera/player proximity do nazwisk — worldgen musi być niezależny od gracza,
- ważny publiczny/architektoniczny helper powinien mieć zwięzły JSDoc z `@domain settlements-npcs`, jeśli pomaga to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

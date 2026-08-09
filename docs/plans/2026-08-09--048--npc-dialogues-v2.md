# NPC Dialogues v2

**Status:** `todo` — draft zweryfikowany wobec kodu 2026-08-10, zakres v1 przycięty, projekt techniczny gotowy do implementacji; zero kodu jeszcze napisane. **Zależy od** [plan 046 (Vue.js + Tailwind stack)](./2026-08-09--046--vue-tailwind-ui-stack.md) Faza 0 (setup) — nowe menu dialogowe budujemy w Vue, nie jako kolejny moduł vanilla DOM (decyzja użytkownika 2026-08-10, patrz „Zależność" niżej).

> Sekcje 1-14 poniżej to oryginalny draft — wizja produktowa, spisana bez dostępu do repo. Review i decyzje poniżej weryfikują ją wobec faktycznego kodu i przycinają zakres v1; sam draft zostaje jako dokumentacja docelowego kierunku.

## Review (2026-08-10, Claude) — vs. realia kodu

Zweryfikowano wobec: `src/ai/dialogue.ts`, `src/ai/NpcAgent.ts`, `src/fauna/animalDialogue.ts`, `src/quests/`, `src/settlement/families.ts`, `src/ai/characters.ts`, `src/ai/schedule.ts`, `src/ai/Needs.ts`, `src/settlement/settlementGenerator.ts`, `src/terrain/naturalResources.ts`, `src/interaction/`, `src/ui/`.

**Największa rozbieżność — nie ma dziś żadnego menu rozmowy.** Interakcja z NPC (`[E]`) to dziś jeden panel z pojedynczą linią tekstu (`src/ui/createNpcDialog.ts`) + opcjonalny accept/decline questu — `NpcDialog.open(name, line, offer?)` przyjmuje dokładnie jeden gotowy string. Draft zakłada realne menu (5 tematów → odpowiedź → powrót do menu) — to nowy, samodzielny komponent UI (lista klikalnych opcji + widok odpowiedzi + integracja z mechanizmem wykluczania paneli/Escape), nie tylko dane/treść.

**Personality już istnieje, inaczej niż zakłada draft.** Nie trzeba budować „Big Five wpływa na wybór wariantu" od zera — to już działa: `personalityForIndex` generuje ciągły `BigFivePersonality` (OCEAN, `dialogue.ts:16-22`), `nearestArchetype()` mapuje go na jeden z 4 dyskretnych archetypów (`'calm'|'cheerful'|'curious'|'grumpy'`), a `pickDialogueLine(personality, need, busy)` już dziś wybiera z banku 32 komórek (4 need × 4 personality × 2 bucket, po 2 warianty PL) — dokładnie model „przygotowane warianty + wybór wg archetypu" z sekcji 6/7 draftu. Trzeba **rozszerzyć ten wzorzec na nowe tematy**, nie projektować nowego systemu wag (`personalityWeights` z sekcji 9 draftu nie jest potrzebny).

**Potrzeby: dziś tylko jedna aktywna naraz.** `NpcAgent.activeNeed: NeedId` (singular), `pickNeed()` zwraca jednego zwycięzcę. Draft chce „NPC może mieć kilka potrzeb jednocześnie" (przykład: drewno + jedzenie) — wymaga nowej, czysto dialogowej funkcji zwracającej wszystkie needs powyżej progu, bez zmiany `pickNeed`/FSM.

**Questy: „wiele ofert" to dziś praktycznie martwy temat.** W całej grze są dokładnie 4 hardkodowane questy (`quests/quests.ts`), każdy z jednym `giverName` — `QuestManager.onInteract(npcName)` zwraca pierwsze dopasowanie z listy. Żaden NPC nie ma dziś dwóch questów, więc „gracz wybiera jedną z kilku ofert" nie ma realnego przypadku użycia. `HELP` → „needs + available quest offers" z draftu powinno w v1 znaczyć: reużyj istniejącej logiki `QuestManager.onInteract`/`resolveInteraction` (dokładnie to, co dziś się dzieje na `[E]`) jako jedną odpowiedź, plus osobno needs-based flavor gdy nie ma aktywnego questu — nie budować nowego mechanizmu wielokrotnego wyboru zadań.

**Rodzina: relacje to dziś etykiety, nie referencje.** `FamilyMember.relation: FamilyRelation` (`'husband'|'wife'|'child'|'single'`) nie wskazuje KOGO — nie ma `spouseId`/`childrenIds` ani referencji do innych `NpcAgent`. Draft chce „spouse → NPC B" jako wskazanie na rzeczywisty byt. Tanie do dodania (rodzina jest już razem w jednej tablicy przy tworzeniu osady, patrz Decyzje), ale to realna, choć mała, zmiana modelu danych.

**`nickname` nie istnieje** (potwierdzone grep — zero wystąpień w repo) — sam draft to warunkowo zakłada („pseudonim — jeśli nie jest jeszcze obsłużony"), więc to zgodne z własnym zastrzeżeniem draftu.

**„Co teraz robisz" — schedule ma tylko godziny START, nie END.** `ScheduleEntry = { hour, activity }` bez pola końca. „Koniec" aktywności to dziś niejawnie godzina następnego wpisu w szablonie (np. `work@7` kończy się gdy zaczyna się `eat@12`) — potrzebny nowy helper znajdujący najbliższy kolejny wpis, żeby wygenerować „...do {endTime}" z przykładów draftu. `NpcAgent.phase`/`pendingAction` (obecny FSM state) są dziś **prywatne, bez publicznego gettera** — nie ma dziś żadnego sposobu odczytania z zewnątrz, co NPC faktycznie robi (poza `getActiveNeed()`/`getScheduledActivity()`).

**Wioska: nie ma `VillageIdentity` ani `history` — dane są rozproszone po `SettlementDef`.** `name`, `size: VillageSize` (**4 wartości: `SM|MD|LG|OUTPOST`, nie 3 jak w drafcie** — `OUTPOST` to realny 4. przypadek, osady jednoosobowe), `terrain: SettlementTerrain` (`ocean|mountain|swamp|desert|forest` — najbliższy odpowiednik „charakteru lokalizacji"), `foodSourceType`, `dominantResource: NaturalResource | null` (pojedynczy, nie lista wszystkich zasobów) — wszystko to już istnieje i wystarcza na „Powiedz coś o wiosce" bez `history`, którego draft chce warunkowo („jeśli dostępne" — nie jest).

**Relation/sympathy: istnieje, ale nie tam gdzie trzeba.** `QuestManager` trzyma `Map<npcName, number>` (`relations`), bumpowany przy ukończeniu questu — dziś widoczny tylko w quest logu (`♥ {giverName} {relation}`), nigdy w dialogu z samym NPC. Do wykorzystania w tonie wypowiedzi trzeba przekazać `questManager.getRelation(name)` do warstwy budującej dialog (już dostępny tam, gdzie dziś rozwiązywana jest interakcja — `resolveInteraction.ts` ma `questManager`).

## Zależność: Vue.js + Tailwind stack ([plan 046](./2026-08-09--046--vue-tailwind-ui-stack.md))

Ustalone z użytkownikiem 2026-08-10: nowe menu dialogowe (jedyny realnie nowy komponent UI w tym planie) budujemy **w Vue**, nie jako kolejny moduł vanilla DOM w `src/ui/`. Plan 046 jest dziś `planned`, zero kodu.

- **Wymagane przed startem:** plan 046 „Faza 0 — Setup i proof-of-concept" musi wylądować i być zielone (`vue`/`@vitejs/plugin-vue`/`@tailwindcss/vite`/`lucide-vue-next` w zależnościach, `#vue-ui` mount point w `createApp.ts`, `tsc`/`vue-tsc`/`lint`/`build` czyste, canvas dalej łapie mouselook z pustym Vue rootem — potwierdzone w przeglądarce).
- **Nie wymagane:** Faza 1 (migracja Villagers screen) ani Faza 2 (pause/quest log/npc dialog) — nowe menu dialogowe to net-new komponent montowany obok istniejących vanilla ekranów (ten sam hybrydowy model co reszta planu 046), nie zależy od migracji żadnego istniejącego ekranu.
- Nowe menu **zastępuje** dzisiejszy `src/ui/createNpcDialog.ts` (nie współistnieje z nim) — stary panel obsługiwał tylko pojedynczą linię + accept/decline, nowe menu w Vue przejmuje całą interakcję `[E]` z NPC. `resolveInteraction.ts`/`QuestManager` zostają jako logika, zmienia się tylko warstwa prezentacji.
- Plan 046's „Esc-priority" (jawny `ui.openStack`) jest we „Fazie 2" — jeśli w momencie implementacji tego planu jeszcze go nie ma, nowe menu dialogowe może potrzebować minimalnej, tymczasowej wersji tego mechanizmu (albo reużyć dzisiejszego `stopImmediatePropagation`-owego wzorca) — do ustalenia przy implementacji, nie blocker na etapie planowania.

Kolejność praktyczna: **plan 046 Faza 0 → ten plan** (menu dialogowe w Vue, treść/dane wg sekcji „Projekt techniczny" niżej). Można je zaimplementować w jednym ciągu prac (Faza 0 to krótka lista kroków) albo jako dwa kolejne kroki tej samej sesji.

## Decyzje (2026-08-10)

**UI:** nowe interaktywne menu rozmowy (lista tematów → odpowiedź → powrót), budowane w Vue — patrz „Zależność" wyżej. Zastępuje `createNpcDialog.ts`.

**Rodzina — imiona, nie tylko etykiety.** `createSettlement.ts` już grupuje `def.families` przed tworzeniem `NpcAgent` (`flatMembers`) — przy tej samej okazji każdy `NpcAgent` dostaje listę pozostałych członków swojej rodziny (`{ name, lastName?, relation }[]`, bez siebie samego) jako nowe, proste pole konstruktora. Żadnych żywych referencji do innych `NpcAgent` (niepotrzebne — dialog o rodzinie to statyczny tekst, nie odczyt aktualnego stanu żony/dziecka). Rozwiązuje „spouse → NPC B" z draftu **bez** budowania grafu relacji.

**Potrzeby — do 2 najsilniejszych w odpowiedzi „Może w czymś ci pomóc".** Nowa, czysto dialogowa funkcja (np. `topNeeds(needs, max=2)` w nowym module dialogowym, nie w `Needs.ts`) zwraca needs powyżej progu posortowane malejąco — bez zmiany `pickNeed`/FSM (ten zostaje jednoznaczny, jedna aktywność na raz). Odpowiedź może wspomnieć 1-2 needs, zgodnie z przykładem z draftu.

**Questy — reużycie istniejącej logiki, bez nowego mechanizmu wielokrotnego wyboru.** Opcja „Może w czymś ci pomóc" najpierw sprawdza `QuestManager.onInteract`/istniejący quest-state-machine (dokładnie to, co dziś się dzieje na `[E]`) — jeśli jest oferta/przypomnienie/raport, to ona jest odpowiedzią. Jeśli nie ma aktywnego questu, odpowiedź to needs-based flavor (`topNeeds` wyżej). „Wiele ofert questowych" pozostaje poza zakresem — dziś nie ma NPC z więcej niż jednym questem.

**Relation/sympathy — przekazane do warstwy dialogu, nie nowy system.** `questManager.getRelation(npcName)` (już istnieje) trafia do nowej warstwy budującej odpowiedzi jako dodatkowy kontekst (np. cieplejszy ton przy wysokiej relacji) — bez zmian w `QuestManager`.

**Aktywność/koniec czasu — nowy helper na istniejącym `ScheduleTemplate`.** Nowa czysta funkcja w `schedule.ts` (np. `nextBoundary(template, timeOfDay): ScheduleEntry`) zwraca najbliższy kolejny wpis — jego `hour` to „do {endTime}" z przykładów draftu. `NpcAgent` dostaje nowy publiczny getter zwracający surowe dane (phase-kind/need/endHour) — **formatowanie tekstu żyje w module dialogowym, nie w `NpcAgent`**, zgodnie z zasadą draftu „szablony nie duplikują danych".

**Poza zakresem v1 (świadomie odłożone):**
- `nickname` — nie istnieje, nie dodajemy teraz (osobna decyzja, poza tym planem).
- Village `history` — nie istnieje, nie wymyślamy teraz treści od zera; „Powiedz coś o wiosce" korzysta z `name`/`size`/`terrain`/`foodSourceType`/`dominantResource`, które już są.
- Głębszy dialogue tree poza questami (sekcja 12 draftu) — model przygotowany pod to (sekcja 9 draftu, `DialogueTemplate`), ale nieimplementowany w v1.
- LLM — jak w drafcie, niepotrzebne do v1.
- Traits (`night_owl`/`fast_worker`/...) modyfikujące TREŚĆ dialogu (nie tylko istniejące efekty liczbowe) — poza zakresem, personality/archetyp już wystarcza na v1.

## Projekt techniczny v1 (2026-08-10, gotowy do implementacji po Fazie 0 planu 046)

### 1. Rozszerzenie danych `NpcAgent`

- **Rodzina po imieniu** — `createSettlement.ts`: przy budowaniu `flatMembers` (dziś `def.families.flatMap(...)`) dociągnąć dla każdego membera listę pozostałych członków tej samej rodziny: `familyMembers: { name: string, lastName?: string, relation: FamilyRelation }[]`. Nowy parametr `NpcAgent.create()`/konstruktora, nowe pole `readonly familyMembers: readonly FamilyMember[]` (bez samego siebie).
- **Aktualna aktywność** — nowy publiczny getter na `NpcAgent`, kształt przykładowy:
  ```ts
  type CurrentActivity = {
    kind: 'sleep' | 'work' | 'wander' | 'need' | 'talking' | 'idle'
    need?: NeedId
    endHour?: number // z nextBoundary(schedule, timeOfDay), gdy dotyczy
  }
  getCurrentActivity(timeOfDay: number): CurrentActivity
  ```
  Mapowanie z prywatnego `phase`/`pendingAction`/`activeNeed` na `CurrentActivity['kind']` — nie wystawiać samego `Phase` na zewnątrz (zostaje implementacyjnym szczegółem FSM).
- **`schedule.ts`**: nowa funkcja `nextBoundary(template: ScheduleTemplate, timeOfDay: number): ScheduleEntry` — analogiczna do `activityAt`, ale zwraca wpis o najmniejszym dodatnim „ile do startu" zamiast „ile od startu". Test: `schedule.test.ts` rozszerzony o przypadki wrap-around (jak `activityAt`).

### 2. Nowy moduł treści dialogowej — `src/ai/dialogueTemplates.ts` (nowy plik, osobny od `dialogue.ts`)

Nie rozbudowywać istniejącego `dialogue.ts` (personality/archetyp — zostaje jak jest, reużywany), tylko dobudować nową warstwę tematów obok:

```ts
export type DialogueTopic = 'help' | 'aboutSelf' | 'currentActivity' | 'aboutVillage' | 'goodbye'

export type DialogueContext = {
  npc: NpcAgent // lub węższy interfejs z potrzebnymi polami, do ustalenia przy implementacji
  timeOfDay: number
  relation: number // z questManager.getRelation
  questLine: string | null // z QuestManager.onInteract, jeśli jest
  village: Settlement // name/size/terrain/foodSourceType/dominantResource
}

export function buildTopicResponse(topic: DialogueTopic, ctx: DialogueContext): string
```

- Banki tekstów per temat × archetyp (jak istniejący `pickDialogueLine`'s 32-komórkowa tablica, ten sam styl: 2 warianty PL na komórkę, fallback na neutralny wariant gdy komórka pusta).
- `aboutSelf`: imię/nazwisko + rola + `familyMembers` (jeśli niepuste: „mam żonę Annę i syna Tomka", budowane z listy, nie hardkodowane na 1 relację) + archetyp-zależny ton.
- `currentActivity`: `npc.getCurrentActivity(timeOfDay)` → tekst z `endHour` gdy dostępny + needs-remark gdy `activeNeed` istotny.
- `aboutVillage`: `village.name`/`size`/`terrain`/`foodSourceType`/`dominantResource`.
- `help`: `questLine` jeśli nie-null, inaczej `topNeeds(...)` sformatowane w 1-2 zdania.
- `goodbye`: prosta pożegnalna linia, zamyka menu.

### 3. Vue: nowy komponent menu

- `src/ui-vue/screens/NpcDialogueMenu.vue` (nazwa robocza) — zastępuje `createNpcDialog.ts`. Fasada zachowuje podobny kontrakt do reszty ekranów z planu 046 (`open(npc, settlement)/close/isOpen`), montowana w tym samym `#vue-ui` root.
- Stan: lista 5 tematów (przycisk „Nic, miłego dnia!" zamyka), po kliknięciu → `buildTopicResponse()` → wyświetl odpowiedź + przycisk powrotu do listy tematów. Quest accept/decline (dziś `NpcDialogOffer`) zostaje jako specjalny sub-widok w obrębie tematu `help`, analogicznie do dzisiejszego zachowania.
- Wpina się w mechanizm wykluczania paneli z planu 046 (`ui.openStack` jeśli już istnieje, inaczej tymczasowy mostek do dzisiejszego wzorca — patrz „Zależność" wyżej).

### 4. Testy

- `src/ai/dialogueTemplates.test.ts` — jak `dialogue.test.ts`: każdy temat × archetyp zwraca niepusty string, fallback nie rzuca, `topNeeds` sortowanie/próg/limit, `aboutSelf` z pustą i niepustą `familyMembers`.
- `schedule.test.ts` — rozszerzony o `nextBoundary`.
- Zero testów dla `.vue` (zgodnie z planem 046 „Poza zakresem" — projekt świadomie nie testuje THREE/DOM/UI jednostkowo).

## Cel

Rozbudować obecną interakcję z NPC z pojedynczej odpowiedzi do prostego, kontekstowego dialogu.

Dialog nie jest osobnym systemem lore. Jest warstwą prezentującą istniejące dane i systemy świata:

- NPC
- rzeczywiste relacje
- zawód / rola
- osobowość
- potrzeby
- FSM / aktualne zajęcie
- scheduler / harmonogram
- wioska
- questy
- pora dnia

NPC powinien sprawiać wrażenie osoby, która wie, kim jest, gdzie mieszka, co robi i czego obecnie potrzebuje.

## 1. Główne menu rozmowy

Po rozpoczęciu rozmowy gracz otrzymuje prostą, płaską listę:

- **Może w czymś ci pomóc?**
- **Powiedz coś o sobie.**
- **Co teraz robisz?**
- **Powiedz coś o wiosce.**
- **Nic, miłego dnia!**

Domyślnie odpowiedź NPC kończy bieżący temat i wraca do głównego menu.

Nie budujemy jeszcze pełnego dialogue tree.

Model powinien jednak być gotowy na późniejsze:

```text
opcja
  ↓
odpowiedź
  ↓
kolejne opcje
  ↓
kolejna odpowiedź
```

Na początku tylko zadania mogą prowadzić do większej liczby opcji.

## 2. „Może w czymś ci pomóc?”

Opcja korzysta przede wszystkim z aktualnych potrzeb NPC.

NPC może mieć kilka potrzeb jednocześnie i przedstawić więcej niż jedną możliwą pomoc.

Przykład:

```text
GRACZ:
Może w czymś ci pomóc?

NPC:
Możesz pomóc mi z drewnem. Ale też... potrzebuję jedzenia.

GRACZ:
- Ok, pomogę Ci z drewnem.
- Pomogę Ci z jedzeniem.
- Wróć.
```

Po wyborze konkretnego zadania uruchamiany jest istniejący system questów.

### Przykładowe szablony

```text
„Przydałoby mi się trochę {resource}."

„Mam problem z {resource}. Możesz mi pomóc?"

„Potrzebuję {resource}. Jeśli możesz coś przynieść, będę wdzięczny."

„Brakuje mi {resource}. Ale właściwie potrzebuję też {resource2}."
```

Warianty zależne od charakteru:

```text
otwarty:
„Hej, jeśli masz chwilę, przydałoby mi się trochę drewna."

uprzejmy:
„Czy mógłbyś pomóc mi zdobyć trochę drewna?"

marudny:
„Jak zwykle brakuje drewna... Jeśli już pytasz, możesz mi trochę przynieść."

zamknięty:
„Nic mi nie potrzeba."
```

Nie każda potrzeba musi automatycznie być questem.

## 3. „Powiedz coś o sobie.”

NPC posiada rzeczywiste dane:

- imię
- nazwisko
- opcjonalny pseudonim
- rzeczywiste relacje rodzinne
- zawód / rola
- osobowość Big Five

Rodzina nie jest tekstem opisowym. Relacje wskazują na rzeczywistych NPC:

```text
NPC A
  spouse → NPC B
  children → NPC C, NPC D
```

Dzięki temu dialog może później korzystać również ze stanu tych NPC.

### Przykładowe szablony

Otwarty:

```text
„Nazywam się {firstName} {lastName}, choć większość mówi na mnie {nickname}.
Jestem {occupation}. Mam {familyDescription}. Lubię poznawać nowych ludzi.
Miło, że pytasz!"
```

Neutralny:

```text
„Jestem {firstName} {lastName}. Jestem {occupation}. Mam {familyDescription}."
```

Zamknięty:

```text
„{firstName} {lastName}. {occupation}. Mam rodzinę."
```

Bardzo zamknięty:

```text
„Nie ma o czym mówić."
```

Marudny:

```text
„{firstName} {lastName}. {occupation}. Żona, syn... Co jeszcze chcesz wiedzieć?"
```

Big Five nie jest ujawniane graczowi jako wartości statystyczne. Osobowość wpływa na sposób wypowiedzi.

## 4. „Co teraz robisz?”

To pytanie jest bezpośrednim oknem na aktualny stan NPC.

Odpowiedź może korzystać z:

- aktualnego FSM state
- aktualnego zajęcia
- zawodu
- schedulera
- planowanego czasu zakończenia aktywności
- potrzeb NPC
- pory dnia

### Przykładowe szablony

```text
„{activity}. Planuję robić to do {endTime}."

„Teraz zajmuję się {activity}. Powinienem skończyć około {endTime}."

„{activity}. Mam jeszcze trochę pracy do {endTime}."
```

Jeżeli potrzeba wpływa na aktywność:

```text
„Zbieram drewno, ale jestem już głodny. Niedługo będę musiał coś zjeść."

„Jeszcze trochę popracuję, ale głód zaczyna mi przeszkadzać."
```

Przykłady innych stanów:

```text
„Pracuję teraz na polu. Powinienem skończyć około 17:00."

„Idę właśnie po wodę. Jestem spragniony, więc najwyższy czas."

„O tej porze zwykle odpoczywam. Dzisiaj jednak muszę jeszcze zająć się drewnem."

„Powinienem już spać. Jest późno i jestem wykończony."
```

Pora dnia nie powinna być wyłącznie prostym filtrem `if night`. Odpowiedź ma wynikać z aktualnego stanu NPC.

## 5. „Powiedz coś o wiosce.”

Informacje pochodzą z istniejącego modelu wioski.

Wioska posiada m.in.:

- nazwę
- rozmiar: `SM / MD / LG` (docelowo możliwe `XS / SM / MD / LG / XL`)
- charakter lokalizacji: np. blisko morza, w górach lub na zwykłym terenie
- zasoby naturalne: określone zasoby mogą występować lub nie
- historię / `history`, jeśli dostępna w `VillageIdentity`

### Przykładowe szablony

```text
„To {villageName}. Jesteśmy niedaleko morza."

„To mała wioska. Mamy sporo {resource} w okolicy."

„Mieszkamy w {villageName}, w pobliżu gór."

„Nie jest nas tu wielu, ale mamy dobre ziemie."

„Jeśli szukasz {resource}, jesteś w dobrym miejscu."
```

NPC nie musi przedstawiać wszystkich informacji naraz. Charakter wpływa na sposób prezentacji i ilość przekazywanych informacji.

## 6. Osobowość

Osobowość Big Five nie generuje dialogu od zera. Jest jednym z czynników wyboru i modyfikacji przygotowanych przez programistę wariantów.

Może wpływać na:

- długość odpowiedzi
- ton
- szczegółowość
- chęć rozmowy
- ilość ujawnianych informacji
- dobór słów
- reakcję na pytanie

Przykład tego samego faktu:

```text
FAKT: NPC jest drwalem.

otwarty:
„Jestem drwalem. Lubię tę pracę, szczególnie kiedy pogoda dopisuje."

neutralny:
„Jestem drwalem."

zamknięty:
„Pracuję przy drewnie."

marudny:
„Jestem drwalem. Ciągle tylko drewno i drewno..."
```

Zamknięty lub bardzo zamknięty NPC może nie udzielić informacji w ogóle.

## 7. Biblioteka szablonów — kluczowa zasada

NPC nie powinien „wymyślać” wypowiedzi z samego kontekstu.

Programiści przygotowują **części składowe i szablony odpowiedzi dla różnych sytuacji**.

Model działania:

```text
kontekst świata
      ↓
wybór pasującego szablonu / wariantów
      ↓
podstawienie danych
      ↓
modyfikacja przez personality / stan / porę dnia
      ↓
gotowa wypowiedź NPC
```

Przykład dla `CURRENT_ACTIVITY`:

```text
activity = chopping_wood
endTime = 18:00
hunger = high
```

Możliwe szablony:

```text
„Zbieram drewno. Planuję robić to do {endTime}."

„Teraz zajmuję się drewnem. Powinienem skończyć około {endTime}."

„Jeszcze pracuję przy drewnie. Mam nadzieję skończyć około {endTime}."
```

Do tego można dobrać komponent potrzeby:

```text
„Ale długo nie dam rady, bo jestem głodny."

„Jestem już głodny, więc niedługo będę musiał zrobić sobie przerwę."
```

Dla nocy:

```text
„Jest późno. Powinienem już spać."

„Nie teraz. Jestem zmęczony, porozmawiajmy rano."

„Porozmawiamy jutro. Naprawdę jestem wykończony."
```

Czyli odpowiedź może składać się z kilku przygotowanych komponentów, a nie tylko z jednego dużego tekstu.

## 8. Algorytm odpowiedzi v1

### Krok 1 — rozpoczęcie rozmowy

```text
[E]
 ↓
find NPC
 ↓
check interaction availability
 ↓
open dialogue
 ↓
show main options
```

### Krok 2 — wybór tematu

```text
player selects topic
 ↓
DialogueSystem receives topic
 ↓
collect relevant context
```

Przykładowo dla `CURRENT_ACTIVITY`:

```text
npc.activity
npc.schedule
npc.needs
npc.personality
world.time
```

### Krok 3 — zebranie faktów

System pobiera wyłącznie dane potrzebne dla danego tematu.

```text
ABOUT_SELF
→ identity + relationships + occupation + personality

CURRENT_ACTIVITY
→ activity + schedule + needs + time

ABOUT_VILLAGE
→ village identity + location + size + resources + history

HELP
→ needs + available quest offers
```

### Krok 4 — wybór dostępnych szablonów

```text
topic
+ context
+ conditions
+ personality
        ↓
candidate templates
```

Warunki mogą być np.:

```text
activity == chopping_wood
hunger > threshold
isNight == true
personality.extraversion > threshold
relationshipExists == true
village.hasResource(resource) == true
```

### Krok 5 — wybór wariantu

Spośród pasujących szablonów wybierany jest wariant zgodny z osobowością i sytuacją.

Docelowo można używać wag zamiast twardego `if/else`, aby NPC nie powtarzał zawsze tej samej kwestii.

### Krok 6 — podstawienie danych

```text
„Teraz zbieram {resource}. Planuję robić to do {endTime}."
```

→

```text
„Teraz zbieram drewno. Planuję robić to do 18:00."
```

### Krok 7 — złożenie wypowiedzi

Opcjonalne komponenty mogą zostać dodane zależnie od kontekstu:

```text
base response
+
need remark?
+
time remark?
+
personality flavor?
```

### Krok 8 — prezentacja

```text
NPC response
 ↓
player sees response
 ↓
return to main menu
```

Wyjątek: questy mogą przedstawić kilka ofert i dodatkowe opcje wyboru.

## 9. Proponowana struktura techniczna

Przykładowy kierunek, bez wymuszania konkretnego API:

```ts
type DialogueTopic =
  | 'help'
  | 'aboutSelf'
  | 'currentActivity'
  | 'aboutVillage'
  | 'goodbye';

type DialogueTemplate = {
  topic: DialogueTopic;
  conditions?: DialogueCondition[];
  personalityWeights?: PersonalityWeights;
  parts: DialoguePart[];
};
```

`DialogueTemplate` powinien opisywać **przygotowany przez programistę wariant**, a nie przechowywać kopię danych NPC/world.

## 10. Zależności

Dialog powinien być cienką warstwą nad istniejącymi systemami:

```text
                 ┌────────────┐
                 │  Dialogue  │
                 │   System   │
                 └─────┬──────┘
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
   NPC / Character  World state       Village
       │               │                │
       ├─ identity     ├─ time          ├─ name
       ├─ family       ├─ activity      ├─ size
       ├─ occupation   ├─ schedule      ├─ location
       └─ personality  └─ needs         ├─ resources
                                        └─ history
                       │
                       ↓
                    Quests
```

Najważniejsza zasada:

> **Dialog nie posiada własnej kopii stanu świata.**

Pobiera aktualne informacje z istniejących systemów i zamienia je na przygotowane przez programistę wypowiedzi.

## 11. Przykładowa pełna rozmowa

```text
GRACZ:
Może w czymś ci pomóc?

NPC:
Możesz pomóc mi z drewnem. Ale też... potrzebuję jedzenia.

GRACZ:
Pomogę Ci z drewnem.

NPC:
Naprawdę? To świetnie. Przyda mi się każda para rąk.

→ quest accepted

GRACZ:
Powiedz coś o sobie.

NPC:
Jestem Jan Kowalski. Większość mówi na mnie Kowal.
Jestem drwalem. Mam żonę Annę i syna Tomka.

GRACZ:
Co teraz robisz?

NPC:
Właśnie zbieram drewno. Planowałem pracować do 18:00,
ale jestem już głodny.

GRACZ:
Powiedz coś o wiosce.

NPC:
To Seedvale. Jesteśmy niedaleko morza.
Drewna mamy sporo, ale z jedzeniem czasem bywa różnie.

GRACZ:
Nic, miłego dnia!

NPC:
Dzięki. Tobie również.
```

## 12. Przygotowanie pod przyszłość

V1:

```text
topic
→ response
→ main menu
```

Przyszłość:

```text
topic
→ response
→ choices
→ response
→ choices
```

Możliwe późniejsze rozszerzenia:

- głębsze dialogue trees
- pamięć rozmów
- opinie NPC o graczu
- relacje i wydarzenia między NPC
- wiedza NPC o świecie
- dynamiczne wydarzenia
- więcej osobowości / traits
- opcjonalny generator LLM

LLM, jeśli kiedyś się pojawi, powinien być rozszerzeniem istniejącego systemu, a nie jego fundamentem. Podstawą pozostają kontrolowane przez programistów szablony, warunki i dane świata.

## 13. Minimalny zakres v1

### Menu

- [ ] Może w czymś ci pomóc?
- [ ] Powiedz coś o sobie.
- [ ] Co teraz robisz?
- [ ] Powiedz coś o wiosce.
- [ ] Nic, miłego dnia!

### NPC

- [x] imię
- [x] nazwisko
- [ ] pseudonim — jeśli nie jest jeszcze obsłużony
- [x] rzeczywiste relacje rodzinne
- [x] zawód / rola
- [x] Big Five

### Świat

- [x] pora dnia
- [x] aktualna aktywność / FSM
- [ ] pełny scheduler potrzebny do naturalnego raportowania planu — zależnie od aktualnego stanu implementacji
- [x] needs
- [x] wioska
- [x] zasoby
- [x] lokalizacja / charakter terenu
- [x] rozmiar wioski
- [ ] history jako źródło dialogu, jeśli nie jest jeszcze dostępne w finalnym modelu wioski

### Questy

- [x] istniejący system questów
- [ ] wiele ofert w ramach odpowiedzi NPC
- [ ] wybór konkretnego zadania z menu dialogowego

### Dialogue

- [ ] system tematów
- [ ] biblioteka szablonów
- [ ] warunki wyboru szablonów
- [ ] podstawianie danych
- [ ] wpływ Big Five na wybór wariantu
- [ ] komponenty odpowiedzi zależne od needs / time / activity
- [ ] powrót do głównego menu
- [ ] przygotowanie modelu pod przyszłe dialogue tree

## 14. Zasady projektowe

1. **NPC odpowiada na podstawie rzeczywistego kontekstu świata.**
2. **Treści odpowiedzi są przygotowane przez programistów.**
3. **Szablony nie duplikują danych NPC ani świata.**
4. **Big Five moduluje sposób wypowiedzi i gotowość do rozmowy.**
5. **Zamknięty NPC może odmówić informacji.**
6. **Pora dnia, potrzeby i aktualne zajęcie mają wpływ na dialog.**
7. **Zwykłe tematy pozostają proste i wracają do głównego menu.**
8. **Questy są jedynym miejscem, które w v1 może mieć dodatkowe opcje.**
9. **Model danych ma być gotowy na głębsze dialogi, ale v1 ich nie implementuje.**
10. **LLM nie jest potrzebne do v1.**
11. **Dialog ma rozszerzać istniejące sprzężenia Seedvale, nie tworzyć równoległego systemu świata.**

## Szkic zmian (pliki)

```
src/ai/dialogueTemplates.ts        # nowy: DialogueTopic, DialogueContext, buildTopicResponse, topNeeds
src/ai/dialogueTemplates.test.ts   # nowy
src/ai/schedule.ts                 # + nextBoundary()
src/ai/schedule.test.ts            # + testy nextBoundary
src/ai/NpcAgent.ts                 # + pole familyMembers, + getCurrentActivity()
src/settlement/createSettlement.ts # + budowanie familyMembers per NPC przed NpcAgent.create()
src/ui-vue/screens/NpcDialogueMenu.vue # nowy (wymaga Fazy 0 planu 046)
src/app/createApp.ts               # zamiana createNpcDialog → NpcDialogueMenu w pętli interakcji [E]
src/ui/createNpcDialog.ts          # usunięty po migracji (albo zostawiony jako fallback — do ustalenia)
```

## Done when

- [ ] Plan 046 Faza 0 zielone (`vue`/Tailwind/lucide w zależnościach, `#vue-ui` mount, canvas dalej łapie input) — prerequisite, nie część tego planu
- [ ] `[E]` na NPC otwiera nowe menu z 5 tematami zamiast starego jednolinijkowego panelu
- [ ] „Może w czymś ci pomóc" pokazuje istniejącą logikę questów gdy jest aktywna, inaczej do 2 needs
- [ ] „Powiedz coś o sobie" wymienia rodzinę po imieniu, gdy `familyMembers` niepuste
- [ ] „Co teraz robisz" pokazuje aktywność + „do {endTime}" z `nextBoundary`, plus needs-remark gdy istotne
- [ ] „Powiedz coś o wiosce" korzysta z name/size/terrain/foodSourceType/dominantResource
- [ ] „Nic, miłego dnia!" zamyka menu
- [ ] Personality (archetyp) widocznie zmienia ton/długość odpowiedzi (reużycie `nearestArchetype`)
- [ ] Esc/click-outside zamyka menu, nie koliduje z pause menu/quest log/innymi overlayami
- [ ] Zero regresji: quest accept/decline nadal działa (`QuestManager`), zwierzęta (`animalDialogue.ts`) bez zmian
- [ ] Console clean: `npx tsc --noEmit` (lub `vue-tsc`), `npm run lint`, `npm run build`, `npm run test`

## Do przetestowania (http://localhost:5577/)

1. Podejdź do NPC, `[E]` — powinno pojawić się menu z 5 opcjami zamiast starego jednolinijkowego dialogu.
2. Przejdź przez każdy temat po kolei dla kilku różnych NPC (różne role/osobowości) — sprawdź że teksty się różnią wg archetypu i faktycznie odzwierciedlają stan (godzina pracy, needs, rodzina).
3. NPC z aktywnym questem — „Może w czymś ci pomóc" pokazuje ofertę/przypomnienie/raport tak jak dziś (accept/decline nadal działa).
4. NPC bez questu, z wysokim need — pokazuje 1-2 needs w odpowiedzi.
5. Esc zamyka menu; otwórz pause menu / quest log w trakcie rozmowy — sprawdź że nic się nie gryzie (kolejność zamykania, brak podwójnego input).
6. Zwierzęta (`[E]` na zwierzę) — nadal stary, prosty dymek tekstowy (`animalDialogue.ts` bez zmian).

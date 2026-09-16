# Plan: Authored quest dialogue narrative polish

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** polish
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-014~~, quests-progression-035, quests-progression-050
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `dialogue` `narrative` `authored-quests` `polish`
**Roadmap:** `quests-and-reputation.md`

## Cel

Przeprowadzić ograniczony, ręcznie autoryzowany pass narracyjny najważniejszych istniejących questów tak, aby dialogi:

- brzmiały jak rozmowy mieszkańców świata, a nie opisy objective/outcome,
- były ciekawsze i bardziej fabularne,
- jasno przekazywały informacje potrzebne graczowi,
- wykorzystywały istniejące konkretne dane świata, gdy są już dostępne,
- nie wkładały graczowi ani NPC wiedzy, której aktualny quest nie posiada,
- zachowały w 100% obecną mechanikę, flow, wybory, konsekwencje i quest state.

Ten plan jest **wyłącznie narracyjnym/pisarskim passem istniejącego contentu**. Rozbudowa questów o nowe fakty świata, osoby, dowody, etapy, wybory, reakcje lub gameplay jest osobnym późniejszym planem.

---

## Zakres

Pass obejmuje w pierwszej kolejności pięć istniejących historii:

1. `Zaginiony myśliwy` — `src/quests/lostHunterNaturalCave.ts`
2. `Podejrzany transport` — `src/quests/suspiciousTransportCaveCache.ts`
3. `Stare kości` — `src/quests/oldBonesAdventureCave.ts`
4. `Zakodowana kronika` — `src/quests/lostTreasureChronicleSearch.ts`
5. `Stara uraza` — `src/quests/lostTreasureChroniclesElder.ts`

Dla każdego questa przejrzeć i poprawić tylko istniejące pola tekstowe, w szczególności:

```text
description
offerLine
reminderLine
playerLine
progressLine
reportPromptLine
reportPlayerLine
reportLine
npcLine
resultText
```

oraz teksty zwracane przez istniejące resolver functions, jeśli są częścią tego samego dialogu.

Nie dodawać nowych etapów ani nowych akcji dialogowych wyłącznie po to, aby zmieścić dodatkowy tekst.

---

## Zasady narracyjne

### 1. NPC mówi jak człowiek; quest log mówi jak system

Dialog NPC nie powinien streszczać struktury questa ani nazw mechanicznych outcome.

Preferować:

```text
„Potrzebuję drobnej przysługi. Zostawiono dla mnie paczkę poza osadą.”
```

zamiast:

```text
„Odbierz przesyłkę i zataję ten układ; X węszy przy tej sprawie.”
```

Informacje stricte gameplayowe mogą pozostać w `description` / `reminderLine`, jeśli są potrzebne do czytelności.

### 2. Nie dopowiadać nieistniejących faktów świata

Narracyjny pass może używać wyłącznie informacji już obecnych w aktualnym quest bindingu/definition/runtime input.

Nie dodawać bez nowego systemowego źródła prawdy:

- imienia zaginionego myśliwego,
- konkretnego pokrewieństwa z giverem, jeśli binding go nie modeluje,
- liczby dni od zaginięcia,
- przyczyny śmierci,
- wcześniejszych obietnic między NPC,
- dodatkowych dowodów lub historii przedmiotów,
- nowych faktów o relacjach rodzinnych,
- wiedzy NPC o świecie, której obecny formatter/binding nie dostarcza.

Takie elementy należą do późniejszego planu gameplay/content expansion.

### 3. Gracz nie może mówić rzeczy, których nie wie

Każdy `playerLine` musi wynikać z faktów osiągalnych w aktualnym flow questa.

Szczególnie `Zaginiony myśliwy` nie może po samym znalezieniu plecaka i łuku deklarować:

```text
„Znalazłem go martwego.”
```

jeżeli aktualny quest nie potwierdza śmierci.

W ramach tego planu poprawić copy tak, aby zachować ten sam outcome i ten sam wybór fizycznego przedmiotu, ale nie wymyślać brakującego faktu.

Przykładowy kierunek:

```text
„Znalazłem jego rzeczy. Łuk zostaje przy mnie.”
```

Dokładny tekst dopracować w implementation pass, zachowując aktualną semantykę outcome.

### 4. Używać konkretnego miejsca i kierunku, jeśli już istnieją

Plan `quests-progression-035` dostarcza player-facing `caveDescription` z istniejących danych świata.

Aktualny formatter `src/quests/caveLocationDescription.ts` wykorzystuje:

- `CaveArchetype`,
- kierunek względem osady,
- opcjonalną istniejącą nazwę miejsca,
- istniejący `Role` mówiącego NPC.

Role terenowe posiadające istniejącą możliwość użycia nazwy miejsca:

```text
guard
hunter
miner
trader
```

Dlatego dialog może naturalnie osadzać gotowe `caveDescription`, np.:

```text
„Widziałem, jak szedł na północ. Kierował się ku Jaskini Mrocznej.”
```

lub, gdy nazwa nie jest dostępna dla danego NPC:

```text
„Widziałem, jak szedł na północ, w stronę małej jaskini.”
```

Nie hardcodować kierunku ani nazwy. Nie rekonstruować ich ponownie z `caveId`. Używać wyłącznie istniejącego resolved `caveDescription` / istniejących danych przekazywanych do buildera.

Jeżeli gramatyczne osadzenie kompletnego `caveDescription` w zdaniu wymaga zmiany helpera, nie wykonywać jej w tym planie. Dopasować zdanie do istniejącej frazy zamiast zmieniać kontrakt formattera.

### 5. Nie powtarzać pełnej instrukcji w każdej linii

Pierwsza rozmowa, która ujawnia miejsce lub fakt, powinna być konkretna.

Późniejsze linie mogą naturalnie używać:

```text
tamta jaskinia
wskazane miejsce
schowek
tamte ruiny
```

jeżeli wcześniej gracz dostał jednoznaczną informację i quest log nadal zachowuje czytelność celu.

### 6. Krótsza ekspozycja, więcej charakteru

Preferować 1–2 naturalne zdania zamiast monologu streszczającego całą historię.

Nie rozbudowywać dialogów objętościowo dla samej długości. Pass ma poprawić rytm, ton i zrozumiałość.

---

## Quest 1 — Zaginiony myśliwy

### Aktualny problem

Obecny flow jest mechanicznie spójny do momentu finału:

```text
giver → witness → cave → pack/bow → giver → return/keep bow
```

Jednak copy jest bardzo funkcjonalne:

- giver mówi o anonimowym „bliskim”,
- witness głównie przekazuje waypoint,
- znalezienie rzeczy jest opisane systemowo,
- jedna linia gracza deklaruje śmierć bez potwierdzenia przez aktualny quest.

### Narracyjny kierunek

- giver powinien brzmieć jak zaniepokojona osoba, ale bez dopisywania nieistniejącej relacji/tożsamości;
- witness powinien naturalnie opisać ostatni znany kierunek i użyć istniejącego `caveDescription`;
- zachować konkretność miejsca: nazwa własna i kierunek, jeśli obecny formatter je udostępnia;
- finał ma mówić wyłącznie o znalezionych rzeczach, nie o potwierdzonej śmierci;
- wybór `return bow` vs `keep bow` pozostaje identyczny mechanicznie.

Przykładowy ton witness line:

```text
„Widziałem go ostatniego. Szedł w tamtą stronę — ${caveDescription}. Potem już go nie spotkałem.”
```

Nie wymuszać dokładnie tej składni, jeśli `caveDescription` brzmi lepiej w innym zdaniu.

---

## Quest 2 — Podejrzany transport

### Aktualny problem

Obecna oferta od razu wyjaśnia prawie cały konflikt:

- przesyłka jest podejrzana,
- giver chce tajemnicy,
- counterpart już „węszy”,
- gracz praktycznie zna moralny układ przed znalezieniem przedmiotu.

Część finalnych `playerLine` brzmi jak opis outcome zamiast naturalnej wypowiedzi.

### Narracyjny kierunek

Bez zmiany flow:

```text
giver → cave cache → choose giver/counterpart/keep
```

- pierwsza prośba ma być bardziej oszczędna i nie wykładać całej intrygi;
- użyć istniejącego `caveDescription` do jasnego wskazania schowka;
- końcowe kwestie skrócić i uczynić bardziej naturalnymi;
- giver i counterpart mają zachować przeciwstawne stanowiska już istniejące w obecnym queście;
- nie dodawać nowej rozmowy, pytania, reakcji ani informacji o pochodzeniu noża.

Przykładowy kierunek offer:

```text
„Potrzebuję drobnej przysługi. Zostawiono dla mnie paczkę poza osadą. Odbierz ją i przynieś prosto do mnie.”
```

Dokładna informacja o schowku pozostaje w istniejącym kolejnym etapie/dialogu.

---

## Quest 3 — Stare kości

### Aktualny problem

Quest ma ciekawy konflikt o sygnet, ale aktualne wypowiedzi są bardzo ekspozycyjne:

```text
„to nasz przodek”
„sygnet powinien wrócić do rodziny”
„przodek obiecał go mojej linii”
```

Obecny binding nie daje jednak materiału, by wiarygodnie rozbudować historię rodu bez wymyślania nowych faktów.

### Narracyjny kierunek

- poprawić naturalność istniejących wypowiedzi bez dodawania dowodów;
- giver ma wskazywać szczątki za pomocą istniejącego `caveDescription`;
- claimant A i claimant B mają mówić bardziej osobowo, ale tylko w granicach już istniejących roszczeń;
- końcowe wybory zachowują dokładnie tych samych odbiorców i outcome;
- nie dodawać inskrypcji sygnetu, testamentu, dawnych obietnic ani dodatkowej weryfikacji — to materiał na plan 2.

---

## Quest 4 — Zakodowana kronika

### Aktualny problem

Quest ma mocny materiał fabularny, ale część dialogów przekazuje kilka informacji naraz, przez co brzmi jak briefing.

Dodatkowo niektóre reminder lines używają języka systemowego, np. wymagania fizycznego posiadania przedmiotu.

### Narracyjny kierunek

- skrócić ekspozycję NPC bez zmiany tego, kiedy gracz otrzymuje konkretne tropy;
- zachować `basic` / `strong` lead i wszystkie obecne różnice wynikające z relacji/reputacji;
- dialog NPC ma przekazywać historię/trop;
- `description` / `reminderLine` mogą precyzyjnie objaśniać wymaganie gameplayowe;
- jeśli techniczny reminder jest potrzebny dla jednoznaczności, sformułować go jako normalny wpis zadania, nie jako wypowiedź NPC;
- nie rozdzielać obecnego jednego dialogu na nowe etapy ani dodatkowe rozmowy.

---

## Quest 5 — Stara uraza

### Aktualny problem

To już jeden z bardziej naturalnych dialogów w aktualnym zestawie, ale część kwestii nadal brzmi jak szybkie streszczenie stanowiska potrzebne do wybrania outcome.

### Narracyjny kierunek

- zachować prostotę sporu i istniejącą niejednoznaczność;
- poprawić rytm i naturalność wypowiedzi obu stron;
- podkreślić, że konflikt trwa od dawna, ale nie dopisywać nowej historii relacji, wydarzeń ani dodatkowych powodów sporu;
- końcowy wybór ma nadal oznaczać dokładnie `support_elder` albo `reconcile`;
- nie zmieniać konsekwencji relacji/reputacji.

Rozbudowana historia stojąca za sporem — np. dawna przyjaźń, pożar, pole, wcześniejsze krzywdy — należy do planu 2, ponieważ wymagałaby ustanowienia nowych kanonicznych faktów świata.

---

## Granice techniczne

### Dozwolone

- zmiana string literals,
- zmiana template strings przy użyciu już dostępnych wartości,
- zmiana helperów zwracających wyłącznie copy, jeśli nie zmienia to kontraktu quest/runtime,
- korekta gramatyki i interpunkcji,
- zmiana `description` / reminder copy dla lepszej czytelności,
- wykorzystanie istniejącego `caveDescription` tam, gdzie builder już je otrzymuje.

### Niedozwolone

Nie zmieniać w ramach tego planu:

```text
QuestDef structure
stages
objectives
mode
transitions
dialogueActions count/targets
physicalOutcomeId
outcomes
rewards
consequences
availability / prerequisites
offer policy
abandonment
effects
world bindings
NPC selection
item/container definitions
persistence
reputation math
relation math
location reveal/navigation semantics
```

Nie dodawać nowych runtime state tylko dla narracji.

---

## Relevant files

Primary content:

```text
src/quests/lostHunterNaturalCave.ts
src/quests/suspiciousTransportCaveCache.ts
src/quests/oldBonesAdventureCave.ts
src/quests/lostTreasureChronicleSearch.ts
src/quests/lostTreasureChroniclesElder.ts
```

Existing prose/location mechanism to reuse, not redesign:

```text
src/quests/caveLocationDescription.ts
src/app/createApp.ts
```

Relevant quest contract/validation:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
```

Tests adjacent to edited builders should be updated only where they assert exact changed copy. Do not weaken behavioral assertions merely because strings changed.

---

## Verification

Automated verification should confirm that the narrative pass did not change quest mechanics:

1. existing quest tests remain green after updating intentional exact-string expectations;
2. `validateQuestDefinitions()` still accepts all edited definitions;
3. tests for outcomes, effects, item transfers, relations/reputation and objective transitions remain unchanged semantically;
4. cave-location tests still prove direction/name behavior independently of rewritten dialogue;
5. add focused regression assertion for `Zaginiony myśliwy`, ensuring no authored player line claims confirmed death unless the quest actually gains such knowledge in a future plan;
6. run the normal relevant unit tests/typecheck/build required by current repository guidance.

Player performs browser/manual verification.

Manual verification should focus on reading the full five quest flows and checking:

- natural conversation rhythm,
- absence of accidental system/debug wording,
- clear objective understanding,
- correct cave name/direction when existing data provides it,
- no invented knowledge,
- no misleading statement about the lost hunter's death.

---

## Non-goals / deferred plan 2

Explicitly defer to a second plan:

- named/identity-bound missing hunter,
- defined family relation to giver,
- corpse/remains or other physical proof of fate,
- additional cave clues,
- new dialogue choices,
- interrogation/follow-up dialogue,
- relation/reputation-dependent dialogue branches,
- NPC anger/cooldowns,
- new actions/reactions after dialogue choices,
- extra claimant evidence in `Stare kości`,
- expanded provenance/evidence for `Podejrzany transport`,
- multi-step investigative restructuring of `Zakodowana kronika`,
- deeper canonical shared history behind `Stara uraza`,
- any new objective, stage, outcome, effect or world-state consequence.

Plan 2 should be prepared separately after this narrative-only pass is implemented/verified, using the improved copy as the baseline rather than mixing content polish with gameplay changes.

---

## Implementation guidance

Keep the implementation intentionally boring: edit authored prose in place, preserve existing quest contracts, and reuse already-resolved presentation values.

Do not refactor quest architecture as part of a copy pass.

For any new or materially changed shared/public helper introduced only if strictly necessary, add concise JSDoc with `@domain quests-progression`. Prefer no new helper if existing strings/template functions are sufficient.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
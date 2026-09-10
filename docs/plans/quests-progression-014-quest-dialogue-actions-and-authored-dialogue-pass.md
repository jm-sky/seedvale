# Plan: Quest Dialogue Actions & Authored Dialogue Pass

**Created:** 2026-09-10
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-005
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `dialogue` `quest-reporting` `choices` `location-hints`
**Roadmap:** `quests-and-reputation.md`

## Cel

Poprawić istniejące questy tak, aby rozmowy, cele i warunki dostępności były logiczne z perspektywy świata i gracza.

Quest powinien prowadzić do naturalnego ciągu:

```text
problem
→ prośba NPC
→ działanie gracza
→ obserwacja / rezultat w świecie
→ powrót
→ świadoma wypowiedź gracza
→ odpowiedź NPC
→ outcome i konsekwencje
```

Zmiana ma rozszerzać istniejący quest/dialogue flow, bez tworzenia osobnego systemu dialogowego.

## Zakres

### 1. Świadome raportowanie wykonania questa

Quest nie powinien kończyć się tylko dlatego, że gracz nacisnął `[E]` przy giverze.

Dla questów wymagających powrotu do NPC:

```text
objective complete
→ ready_to_report
→ rozmowa z NPC
→ wypowiedź gracza
→ resolution
```

NPC nie powinien reagować na informację, której gracz faktycznie nie przekazał.

Dotyczy m.in. zwiadu, odnajdywania NPC/zwierząt, dostarczania przedmiotów, odkrywania lokacji, walki i problemów osady.

### 2. `talk_to_npc` jako rzeczywista rozmowa

Jeżeli objective mówi o przekazaniu wiadomości lub informacji NPC, sama interakcja nie powinna zaliczać celu.

Przykład:

```text
Piotr:
„Tak?”

Gracz:
„Anna mówiła, że jutro idziecie na ryby o świcie.”

Piotr:
„Dzięki, że przekazałeś. Będę o świcie.”
```

Dopiero świadoma wypowiedź gracza zalicza etap.

### 3. `talk_to_npc_choice` jako świadomy wybór

Branching quest nie może rozstrzygać outcome przez samo podejście do jednego z NPC.

Dotyczy minimum:

- `zaginiona-przesylka`,
- `sporne-drewno`.

Gracz musi zobaczyć i wybrać konkretną deklarację, np.:

```text
„Znalazłem przesyłkę. Proszę, jest twoja.”
```

albo:

```text
„Znalazłem przesyłkę Kasi. Przekazuję ją straży.”
```

Dopiero wybór powoduje odpowiedni outcome.

### 4. Lepszy kontekst decyzji

Questy z wyborem powinny wyjaśniać, dlaczego istnieją różne możliwości.

W `zaginiona-przesylka`:

- Kasia powinna jasno powiedzieć, dlaczego chce odzyskać przesyłkę,
- Marek powinien mieć własny powód, aby ją przejąć,
- gra nie powinna od razu ujawniać, kto ma rację.

Wybór ma wynikać z informacji dostępnych graczowi, a nie tylko z dwóch mechanicznych przycisków.

### 5. Poprawa authored quest text

Przejrzeć istniejące questy pod kątem:

- naturalnego języka polskiego,
- jasnego problemu,
- zrozumiałego celu,
- sensownego reminderu,
- meaningful discovery text,
- naturalnego raportu gracza,
- reakcji NPC zgodnej z tym, co faktycznie się wydarzyło,
- zgodności tekstu z mechaniką.

Unikać tekstów w rodzaju:

```text
„Jeleń zauważony.”
„Ruiny zbadane.”
„Cel wykonany.”
```

Preferować obserwowalne fakty świata.

### 6. Kierunkowe wskazówki lokalizacji

Jeżeli NPC zna konkretną lokalizację celu i jego pozycja jest już dostępna w istniejącym quest/world binding flow, powinien podać graczowi podstawowy kierunek.

Przykład zamiast:

```text
„Jaskinia jest kawałek za osadą.”
```

użyć:

```text
„Jaskinia jest na północny wschód od osady,
kawałek za ostatnimi zabudowaniami.”
```

Minimalnie obsłużyć `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`.

Kierunek powinien być derived z rzeczywistego położenia celu względem osady, a nie hardcoded w quest content.

### 7. Performance guardrail dla location hints

Wskazówka kierunkowa nie może powodować dodatkowego kosztownego world search.

Może korzystać tylko z danych, które i tak są dostępne podczas istniejącego target bindingu.

Nie wykonywać tylko dla tekstu:

- skanowania świata,
- wyszukiwania jaskiń,
- terrain sampling,
- pathfindingu,
- raycastów,
- visibility checks,
- per-frame calculations,
- worker round-tripów.

Jeżeli pozycja celu nie jest dostępna bez dodatkowego kosztownego lookupu, użyć neutralnego fallbacku, np.:

```text
„Jaskinia jest poza osadą. Sprawdź ją i wróć do mnie.”
```

### 8. Konkretne world targets

Quest mówiący o konkretnej jaskini nie może zostać zaliczony przez dowolną jaskinię tego samego typu.

Wykorzystać istniejącą stabilną identity world entity/spawn pointu zamiast tworzyć quest-only identity.

Dotyczy minimum:

- `sprawdz-szlak`,
- `zaginiona-przesylka`.

Ten sam resolved target powinien służyć zarówno do poprawnego objective bindingu, jak i — jeżeli jego pozycja jest już dostępna — do wygenerowania directional hint.

Nie wykonywać dwóch osobnych lookupów.

### 9. Quest availability zgodne z logiką świata

Przejrzeć istniejące `availability.prerequisites` pod kątem sensu fabularnego i systemowego.

Warunek relacji, reputation, renown albo wcześniejszego questa powinien istnieć tylko wtedy, gdy NPC rzeczywiście miałby powód odmówić graczowi dostępu do sprawy.

Pilne problemy osady nie powinny być sztucznie blokowane przez sympatię NPC.

#### `wilki-pod-osada`

Quest nie powinien wymagać:

- wcześniejszego ukończenia `grozny-wilk`,
- relacji `trusted` z Anną.

Jeżeli wilki stanowią realne zagrożenie dla osady, Anna powinna poprosić o pomoc niezależnie od wcześniejszego questline'u i poziomu relacji.

Relacja może wpływać później na ton rozmowy, wdzięczność, reward/consequences albo dalsze questy, ale nie powinna blokować samej prośby o pomoc w sytuacji zagrożenia.

Nie zastępować tych warunków innym arbitralnym gate'em typu renown/reputation.

Jeżeli istniejący world/problem state już określa wystąpienie zagrożenia, użyć go jako naturalnego warunku dostępności. Nie tworzyć osobnego systemu tylko dla tego questa.

### 10. Audyt pozostałych availability gates

Dla każdego questa posiadającego prerequisites odpowiedzieć:

> Czy NPC rzeczywiście odmówiłby poproszenia tego gracza o pomoc w tej sytuacji?

Relation/reputation gates mogą mieć sens dla prywatnych spraw, sekretów, osobistych przysług, zadań wymagających wysokiego zaufania oraz politycznie lub społecznie wrażliwych informacji.

Powinny być podejrzane dla ataku zwierząt, zagrożenia mieszkańców, plagi, awarii, pożaru, braku podstawowych zasobów i innych pilnych problemów społeczności.

Nie usuwać gate'ów mechanicznie — poprawić tylko te, które są sprzeczne z charakterem problemu.

### 11. Otwarcie rozmowy nie może omijać listy dialogowej

Naprawić regresję wprowadzoną w commicie `499004546eeaf15c6003bcb3f3d0ed79b7a0b9e2` (`Fix talk_to_npc dialogue so quest lines show on NPC open`).

Po zwykłej interakcji `[E]` z NPC dialog powinien zaczynać się od istniejącej listy tematów. Sam fakt, że `QuestManager` ma dla tego NPC questowy override, ofertę, reminder, `talk_to_npc` progress line albo raport, nie może automatycznie przełączać UI na widok `help` ani od razu pokazywać `Przyjmij` / `Odmów`.

Oczekiwany flow:

```text
[E] NPC
→ lista tematów rozmowy
→ gracz świadomie wybiera questową / pomocową wypowiedź
→ dopiero wtedy resolve quest dialogue/action
→ ewentualny progress / accept / report / outcome
```

Wyjątek: istniejący `paymentClaim` może zachować specjalne auto-open, jeżeli recon potwierdzi, że jest to zamierzone i niezależne zachowanie płatności za pracę.

Obecny seam wymaga przebudowy, ponieważ `openNpcDialogueMenu()` wywołuje mutujące `QuestManager.onInteract(npc.name)` jeszcze podczas otwierania UI, a commit `49900454` dodatkowo utrwala automatyczne wejście w `help` przez `helpFromQuestManager` / `resolveNpcDialogueOpenTopic()`.

W ramach implementacji:

- nie wywoływać mutującej quest action tylko z powodu otwarcia modala NPC,
- oddzielić otwarcie listy tematów od świadomego wyboru questowej akcji,
- `talk_to_npc` i `talk_to_npc_choice` mogą zmienić quest state dopiero po odpowiedniej player dialogue action,
- oferta questa może pokazać `Przyjmij` / `Odmów` dopiero po wybraniu przez gracza odpowiedniej opcji rozmowy,
- reminder/progress/report line nie powinny przejmować całego dialogu przy `[E]`,
- usunąć albo zmienić `helpFromQuestManager` i `resolveNpcDialogueOpenTopic()` dla przypadku `help`, jeżeli po reconie nie mają już poprawnej odpowiedzialności,
- poprawić test dodany w `src/ui-vue/npcDialogueOpen.test.ts`, który obecnie oczekuje `resolveNpcDialogueOpenTopic() === 'help'` i tym samym utrwala regresję.

Nie naprawiać tego przez sam kosmetyczny revert auto-open, jeśli `QuestManager.onInteract()` nadal mutuje quest state przy otwarciu dialogu. Fix ma przywrócić poprawny UX i właściwy moment advancementu.

## Reference quest: `sprawdz-szlak`

Zachować istniejące ID dla kompatybilności save: `sprawdz-szlak`.

### Tytuł

`Sprawdzenie jaskini`

### Opis

```text
Kasia prosi o sprawdzenie jaskini znajdującej się poza osadą.
Ostatnio zauważono tam świeże ślady zwierząt.
```

### Oferta

```text
„Ostatnio ktoś widział świeże ślady przy jaskini za osadą.
Możesz tam zajrzeć i sprawdzić, czy nie kręci się tam
coś niebezpiecznego? Zapłacę ci za fatygę.”
```

Jeżeli kierunek jest tanio dostępny, zastąpić ogólne określenie np. `przy jaskini na północny wschód od osady`.

### Objective

`Sprawdź jaskinię wskazaną przez Kasię.`

### Reminder

Preferowany:

```text
„Jaskinia jest na północny wschód od osady,
kawałek za ostatnimi zabudowaniami.
Sprawdź tylko, co się tam dzieje, i wróć do mnie.”
```

Fallback:

```text
„Jaskinia jest poza osadą.
Sprawdź tylko, co się tam dzieje, i wróć do mnie.”
```

### Discovery

```text
„Wokół wejścia widać świeże ślady zwierząt.
To miejsce zdecydowanie nie jest opuszczone.”
```

### Return

Kasia:

```text
„I jak? Udało ci się sprawdzić jaskinię?”
```

Gracz:

```text
„Tak. Są tam świeże ślady.
Wygląda na to, że coś regularnie korzysta z tej jaskini.”
```

Kasia:

```text
„Dobrze, że to sprawdziłeś.
Przynajmniej wiemy, że trzeba tam uważać.
Dzięki — proszę, to za pomoc.”
```

Zachować aktualny reward, o ile recon implementacyjny nie ujawni sprzeczności.

## Questy wymagające authored pass

Minimum:

- `relay-anna-piotr`
- `shells-dla-kasi`
- `woda-dla-marka`
- `zwiadowca`
- `zagubiona-owca`
- `drewno-na-naprawe`
- `ziola-dla-anny`
- `kamienie-dla-piotra`
- `sprawdz-szlak`
- `lis-przy-osadzie`
- `grozny-wilk`
- `wilcza-jama`
- `wilki-pod-osada`
- `zaginiona-przesylka`
- `sporne-drewno`
- `drewno-dla-anny`
- `drewno-dla-piotra`
- `dzik-przy-szlaku`
- `plaga-szcurow`
- `stare-ruiny`
- `slad-przy-monolicie`
- `zapomniany-cmentarz`
- `mapa-do-skarbu`
- `wilki-u-kupca`

Nie zmieniać istniejących quest IDs ani outcome IDs tylko z powodu poprawy contentu.

## Persistence

Nowe dialogue lines i directional presentation data nie powinny wymagać nowego persistent quest state.

Zachować istniejący authority dla quest state, stage index, outcomes, rewards, consequences, relations, reputation i renown.

Directional hints są derived data i nie powinny trafiać do save.

Stary save znajdujący się w `ready_to_report` powinien po zmianie po prostu otrzymać nową świadomą opcję raportowania.

## Verification

Automatycznie zweryfikować minimum:

- zwykłe `[E]` na NPC otwiera listę tematów, nawet gdy `QuestManager` ma questowy override lub ofertę,
- oferta questa pokazuje `Przyjmij` / `Odmów` dopiero po świadomym wyborze questowej opcji dialogowej,
- samo otwarcie rozmowy nie kończy `ready_to_report`,
- samo otwarcie rozmowy nie zmienia `talk_to_npc` ani `talk_to_npc_choice` quest state,
- wybranie player dialogue action kończy quest dokładnie raz,
- `talk_to_npc` nie zalicza celu samą interakcją,
- `talk_to_npc_choice` nie wybiera outcome samą interakcją,
- zamknięcie dialogu bez wyboru pozostawia quest aktywny,
- test regresyjny obejmuje zachowanie wprowadzone przez `49900454` i nie oczekuje auto-open `help`,
- konkretna jaskinia zalicza objective, inna nie,
- directional mapping działa dla 8 kierunków,
- brak dodatkowych world lookups w dialogue interaction path,
- `wilki-pod-osada` nie wymaga `grozny-wilk` ani `trusted`,
- istniejące rewards/consequences pozostają exact-once,
- save/load nie powoduje powtórzenia resolution.

Uruchomić odpowiednie testy questów, interaction/UI, typecheck i build.

Browser verification wykonuje User.

Nie uruchamiać `pnpm docs:sync` ręcznie.

## Non-goals

Nie dodawać:

- generic dialogue tree engine,
- dialogue graph/DSL,
- LLM dialogue,
- osobnego quest dialogue managera,
- osobnego quest dialogue store,
- nowego quest modala,
- nowego spatial index tylko dla dialogów,
- pathfindingowych opisów drogi,
- quest-item inventory dla istniejącej przesyłki,
- nowego morality systemu,
- unrelated refactorów NPC/fauna/world/UI.

## Guardrails

- Rozszerzać istniejący `QuestManager` i obecny NPC dialogue flow.
- QuestManager pozostaje authority dla progress i resolution.
- UI nie może samodzielnie interpretować quest state ani outcomes.
- Otwarcie NPC dialogue UI jest operacją prezentacyjną i nie może samo mutować quest progress/outcome.
- Quest state może zmieniać się przez dialog dopiero po jawnej player dialogue action odpowiadającej danej czynności.
- Questowy override nie może automatycznie omijać listy tematów rozmowy.
- Reużyć istniejącą identity world targets.
- Target resolve wykonywać najwyżej raz w istniejącym binding flow.
- Direction hints wyliczać wyłącznie z już dostępnych danych.
- Nie wykonywać spatial/world lookupu podczas otwierania dialogu tylko dla tekstu.
- Nie zmieniać quest IDs/outcome IDs.
- Nie zmieniać istniejącego reward balance bez konkretnego powodu.
- Availability musi wynikać z natury problemu, nie z arbitralnej progresji.
- Pilne problemy świata nie powinny czekać na sympatię gracza.
- Dla ważnych nowych public/integration seams dodać JSDoc, jeśli poprawi preflight discovery; użyć `@domain quests-progression`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
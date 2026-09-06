# Plan: Paid Quests & Player Income

**Created:** 2026-09-06  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** quests-progression-002  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `rewards`  
**Tags:** `quests` `coins` `income` `economy`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać pierwszą spójną pętlę gameplay:

```text
NPC potrzebuje pomocy
→ oferuje płatny quest
→ gracz wykonuje istniejącą czynność w świecie
→ raportuje wykonanie
→ otrzymuje coins
→ może wydać je u kupca
```

Gracz powinien mieć kilka sensownych sposobów zarabiania pieniędzy przez questy wykorzystujące już istniejące mechaniki świata.

Nie tworzyć osobnego `JobManager`, systemu pracy gracza ani alternatywnej waluty.

Paid quest pozostaje zwykłym questem obsługiwanym przez `QuestManager`.

---

## 1. Wspólny system questów

Nie wprowadzać osobnego typu runtime:

```ts
PaidQuest
Job
ContractQuest
```

Paid quest jest normalnym `QuestDef` wykorzystującym model rewards/outcomes z `quests-progression-002`.

Przykład:

```ts
reward: {
  visibility: 'shown',
  items: [
    { kind: 'coin', count: 8 }
  ]
}
```

Nie dodawać osobnej ścieżki:

```text
job reward
→ wallet
```

Coins korzystają ze zwykłego inventory/grant path.

---

## 2. Paid quests vs authored RPG quests

Paid quest opisuje przede wszystkim prostą usługę lub pracę wykonywaną za ustalone wynagrodzenie.

Typowe przykłady:

```text
dostarczenie materiałów
zebranie zasobów
proste zwiadowanie
pomoc przy gospodarstwie
znalezienie zwierzęcia
usunięcie lokalnego zagrożenia
```

Nie oznacza to osobnej klasy questa.

Nie dodawać metadata:

```ts
type: 'paid'
```

jeżeli nie ma konkretnego runtime/UI consumera.

Charakter questa wynika z jego treści i reward.

---

## 3. Skala wynagrodzeń

Obecny merchant catalog pozostaje źródłem odniesienia dla wartości pieniędzy.

Przykładowe obecne ceny:

```text
bread            6
knife           12
trap_simple     14
shovel          20
axe             25
pickaxe         30
tent            30
short_sword     40
long_sword      50
backpack        70
```

Nie tworzyć drugiego katalogu wartości przedmiotów dla questów.

### Docelowa orientacyjna skala

Przyjąć jako tuning guideline:

```text
bardzo drobna przysługa       3–5 coins
prosta praca                  5–10 coins
większa praca                10–20 coins
niebezpieczne zadanie        20–40 coins
duże / wyjątkowe zadanie     40+ lub reward specjalny
```

To nie jest automatyczny kalkulator ceny.

Quest autor jawnie ustala reward.

Skala ma zapobiegać przypadkowym wartościom niepowiązanym z istniejącym handlem.

---

## 4. Reward nie może być prostym `tradeValue × multiplier`

Nie implementować mechanizmu:

```ts
questReward = tradeValue(items) * 2
```

Wynagrodzenie obejmuje nie tylko wartość materiału, ale także:

- czas,
- wysiłek,
- ryzyko,
- dostępność zasobu,
- podróż,
- usługę wykonaną dla NPC.

Jednocześnie reward powinien pozostać rozsądny względem wartości ekonomicznej celu.

---

## 5. Rebalance istniejącego `drewno-na-naprawe`

Obecnie:

```text
5 branches
→ 15 coins
```

`branch` ma `tradeValue = 1`.

Prosty fetch quest nie powinien płacić trzykrotności wartości dostarczonego materiału bez dodatkowego uzasadnienia.

Ustalić:

```text
5 branches
→ 8 coins
```

To nadal daje premię za wykonanie konkretnej usługi, ale nie dewaluuje monet.

Reward:

```text
visibility: shown
8 coins
```

Quest ma charakter formalnej/prostej pracy.

Nie zwiększać relation tylko za jego wykonanie.

---

## 6. `woda-dla-marka`

Po `quests-progression-002`:

```text
reward = 5 coins
```

Pozostawić bez dalszych zmian.

To będzie przykład bardzo drobnej płatnej przysługi.

---

## 7. `zagubiona-owca`

Pozostawić:

```text
returned_to_owner
→ 10 coins
```

Szukanie zwierzęcia wymaga większego zaangażowania niż prosta interakcja lub zebranie kilku materiałów.

Nie zwiększać wypłaty w tym planie.

---

## 8. Nowe płatne questy

Dodać kilka nowych, ręcznie zdefiniowanych questów.

Celem nie jest ilość, ale pokazanie różnych istniejących mechanik gameplay.

Docelowo dodać **4 nowe paid quests**.

### A. Zioła dla mieszkańca

Objective:

```text
gather_item
herb × 3
```

Reward:

```text
8 coins
visibility: shown
```

Uzasadnienie ekonomiczne:

```text
3 herbs tradeValue ≈ 9
```

Quest nie powinien być sposobem na sprzedawanie tego samego surowca dużo powyżej jego wartości handlowej.

Może jednak być korzystny, ponieważ NPC potrzebuje konkretnego towaru i gwarantuje odbiór.

Nie dodawać relation consequence.

### B. Kamienie do naprawy

Objective:

```text
gather_item
stone × 6
```

Reward:

```text
9 coins
visibility: shown
```

Wykorzystuje istniejący gathering.

Nie dodawać nowych rodzajów materiałów ani construction integration.

Narracyjnie materiał ma być potrzebny do naprawy istniejącego elementu osady.

W tym planie quest nie musi faktycznie wykonywać konstrukcyjnej zmiany świata.

### C. Rozpoznanie okolicy

Wykorzystać istniejący objective oparty o landmark albo miejsce świata, jeśli obecny kod pozwala bez dokładania nowego subsystemu.

Preferować:

```text
interact_landmark
```

lub istniejący odpowiednik zwiadu.

Reward:

```text
12 coins
visibility: shown
```

Ma pokazać, że zarabianie nie ogranicza się do fetch questów.

Nie tworzyć nowych procedural landmarków tylko dla tego questa.

### D. Lokalny drapieżnik

Wykorzystać istniejące fauna objective:

```text
kill_target_animal
```

Preferować wilka lub inny już wspierany niebezpieczny gatunek.

Reward:

```text
25 coins
visibility: shown
```

Jeżeli target jest rzeczywistym zagrożeniem dla społeczności, quest może także otrzymać niewielkie explicit social consequences:

```text
competence +
courage +
renown +
```

Nie używać significant values z `grozny-wilk`.

Paid quest ma być mniejszym zleceniem niż istniejący authored quest o wyjątkowo groźnym wilku.

---

## 9. Dobór giverów

Wykorzystać istniejących NPC.

Nie tworzyć nowych NPC tylko po to, żeby rozdawali questy.

Rozłożyć nowe questy między kilku mieszkańców, żeby gra nie wyglądała jak jeden „quest hub NPC”.

Quest powinien wynikać z sensownej potrzeby konkretnej postaci lub osady.

---

## 10. Relation

Paid quest nie zwiększa automatycznie relation.

Domyślnie nowe formalne paid quests:

```text
relation consequence = none
```

Wyjątek jest możliwy tylko wtedy, gdy charakter konkretnego zadania jest osobisty.

Nie wykorzystywać relation jako dodatkowej standardowej zapłaty.

---

## 11. Reputation / renown

Nie każdy płatny quest wpływa na reputation.

Prosta dostawa:

```text
no reputation
no renown
```

Publicznie istotne zadanie:

```text
small reputation / renown consequence
```

Przykład:

```text
usunięcie drapieżnika z okolicy
→ competence +3
→ courage +3
→ renown +3
```

Dokładne wartości sprawdzić względem wartości ustalonych w `quests-progression-001`, aby zwykłe zlecenia pozostawały wyraźnie poniżej dużych questów `grozny-wilk` i `wilcza-jama`.

---

## 12. Brak osobnego systemu repeatable jobs

Nie implementować teraz:

```text
daily jobs
job board
procedural commissions
repeatable quest generator
contract rotation
```

Nowe paid quests mogą być jednorazowe.

Celem planu jest działająca pętla:

```text
quest → coins → merchant
```

Repeatability można dodać później tylko wtedy, gdy gameplay faktycznie zacznie potrzebować stałego odnawialnego źródła pieniędzy.

---

## 13. Gracz nie powinien być jedynym źródłem rozwiązania problemów świata

Paid quests w tym planie są głównie authored gameplay.

Nie próbować jeszcze generować ich automatycznie z household/settlement needs.

Jednocześnie treść powinna być zgodna z istniejącymi systemami świata.

Nie tworzyć narracji przeczących aktualnemu state.

Przykład:

```text
NPC prosi o drewno do naprawy
```

jest sensowny.

Ale nie tworzyć fikcyjnego systemu budowy lub produkcji tylko po to, żeby technicznie konsumować materiał po zakończeniu questa.

---

## 14. Delivery semantics

Dla `gather_item` sprawdzić istniejącą semantykę.

Jeżeli obecny QuestManager jedynie sprawdza posiadanie wymaganych items, upewnić się, że płatne questy dostawcze **faktycznie konsumują przekazywane przedmioty przy turn-in**.

Gracz nie może:

```text
mieć 5 branches
→ oddać je Piotrowi
→ zachować te same 5 branches
→ dostać 8 coins
```

Jeżeli istniejący mechanizm już konsumuje gathered items, użyć go.

Jeżeli nie — dodać consumption do wspólnego quest delivery path, nie tylko do nowych paid quests.

### Atomicity

Turn-in musi być atomowy:

```text
validate items
→ consume required items
→ resolve outcome
→ grant reward
```

Nie konsumować materiałów, jeśli quest nie może zostać poprawnie rozwiązany.

---

## 15. Quest text

Paid quest powinien jasno komunikować wynagrodzenie, jeśli reward ma:

```text
visibility: shown
```

Offer dialogue powinien naturalnie podać kwotę.

Przykład:

```text
„Przynieś mi sześć kamieni. Dam ci za nie dziewięć monet.”
```

Nie polegać wyłącznie na Quest Log.

Reward text w dialogu i `QuestReward` muszą odpowiadać sobie.

Nie tworzyć dynamicznego formattera dialogów w tym planie.

---

## 16. Quest Log

Wykorzystać reward display z `quests-progression-002`.

Paid quest powinien pokazywać np.:

```text
Nagroda: 9 monet
```

Nie tworzyć osobnego ekranu jobs/contracts.

---

## 17. Economy sanity checks

Przed finalizacją wartości nowych questów porównać je z:

```ts
MERCHANT_PRICES
tradeValue()
sellPrice()
```

Sprawdzić przynajmniej:

- podstawowe jedzenie,
- podstawowe narzędzia,
- broń,
- backpack,
- skill books,
- zasoby wykorzystywane w nowych questach.

Nie zmieniać całego merchant economy tylko po to, żeby dopasować je do questów.

Jeżeli recon pokaże oczywistą istniejącą anomalię cenową, zanotować ją jako osobny follow-up zamiast rozszerzać scope.

---

## 18. Docelowa pacing economy

Nowy gracz powinien po wykonaniu kilku małych questów móc kupić coś gameplayowo użytecznego.

Orientacyjny cel:

```text
2–3 drobne questy
→ podstawowe narzędzie / zapasy

4–6 prostych questów
→ narzędzie pokroju axe/pickaxe/tent

większa liczba prac lub trudniejsze zadania
→ dobra broń / backpack / książki
```

Nie próbować w tym planie projektować pełnej ekonomii długoterminowej.

Chodzi o uniknięcie dwóch skrajności:

```text
jeden prosty quest → najlepszy sprzęt
```

oraz:

```text
dziesiątki questów → ledwo jeden podstawowy przedmiot
```

---

## 19. Tests

Dodać/zmienić testy obejmujące:

- paid quest grantuje właściwą liczbę coins,
- `shown` reward jest dostępny w Quest Log DTO,
- reward przyznawany dokładnie raz,
- failed outcome nie wypłaca wynagrodzenia,
- formalny paid quest nie zwiększa relation,
- publicznie ważny paid quest może mieć explicit reputation/renown consequence,
- `gather_item` delivery konsumuje wymagane items dokładnie raz,
- brak możliwości turn-in bez odpowiedniej liczby items,
- consumption i reward są częścią poprawnego resolution,
- inventory overflow korzysta ze wspólnego `grantItem`,
- save/load nie umożliwia ponownego odebrania reward.

---

## 20. Existing quests regression

Sprawdzić co najmniej:

```text
woda-dla-marka
zagubiona-owca
drewno-na-naprawe
grozny-wilk
wilcza-jama
```

Nie zmieniać objectives `grozny-wilk` ani `wilcza-jama`.

`drewno-na-naprawe` zmienić:

```text
15 coins → 8 coins
```

Reszta wartości zgodnie z `quests-progression-002`.

---

## Non-goals

Plan nie obejmuje:

- JobManager,
- quest board,
- procedural jobs,
- repeatable/daily quests,
- wages/salaries,
- player profession,
- employment contracts dla gracza,
- generowania questów z household needs,
- dynamic pricing,
- merchant economy redesign,
- quest reward formulas,
- bargaining over quest payment,
- reputation-based pay modifiers,
- skills affecting pay,
- non-monetary major rewards,
- authored RPG quest chains,
- advanced availability/prerequisites.

---

## Kolejność implementacji

1. Zweryfikować po `quests-progression-002` finalny reward/outcome contract.
2. Sprawdzić i ujednolicić delivery item consumption.
3. Ustalić tuning względem `tradeCatalog.ts`.
4. Zmienić `drewno-na-naprawe` z 15 na 8 coins.
5. Dodać 4 nowe paid quests wykorzystujące istniejące objectives.
6. Dodać explicit social consequences tylko tam, gdzie zadanie ma publiczne znaczenie.
7. Zaktualizować dialogi tak, żeby shown payment był komunikowany przed przyjęciem.
8. Dodać tests.
9. Zaktualizować canonical quest/economy docs.
10. Dodać implementation notes zgodnie z `PLANNING.md`.

Dla nowych/zmienionych ważnych publicznych funkcji i klas dodać JSDoc tam, gdzie poprawia to preflight discovery; użyć `@domain quests-progression` dla istotnych punktów architektury.

---

## Verification

### Automated

Uruchomić odpowiednie:

- QuestManager tests,
- quest definition tests,
- inventory/delivery tests,
- reward tests,
- reputation integration tests,
- persistence tests,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja odbywa się przez GitHub workflow.

### Manual — User

User sprawdza w przeglądarce:

1. Można przyjąć kilka nowych płatnych questów.
2. Przed przyjęciem wiadomo, ile wynosi jawna zapłata.
3. Quest Log pokazuje reward.
4. Po wykonaniu questa coins trafiają do inventory.
5. Coins można następnie wydać u istniejącego merchant.
6. Dostarczone materiały faktycznie znikają z inventory.
7. Reward nie może zostać odebrany drugi raz.
8. Formalne prace nie zwiększają automatycznie relation.
9. Publicznie ważne zadanie może zwiększyć niewielką reputation/renown.
10. `drewno-na-naprawe` daje 8 zamiast 15 coins.
11. Existing RPG/fauna/landmark quests nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

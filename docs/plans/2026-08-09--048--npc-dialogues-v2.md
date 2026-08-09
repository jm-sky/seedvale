# NPC Dialogues v2

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

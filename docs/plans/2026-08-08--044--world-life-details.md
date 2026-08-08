> Szkic od ChatGPT

# Plan 044 — Drobne życie i detale świata

## Cel

Dodać niewielkim kosztem elementy, które sprawią, że świat Seedvale będzie wyglądał na bardziej zamieszkany, naturalny i dopracowany.

Plan ma charakter **visual polish + world life**. Nie powinien wprowadzać dużych nowych systemów gameplayowych.

Najważniejszy efekt:

> **Świat powinien sprawiać wrażenie miejsca, w którym życie toczy się również bez udziału gracza.**

---

## 1. Życie w wiosce

### 1.1. Światła w domach

Dodać widoczne światła w domach:

- zapalane wieczorem/nocą,
- gaszone rano,
- powiązane z istniejącym cyklem dnia/nocy,
- widoczne również z pewnej odległości,
- poprawiające atmosferę wioski po zmroku.

### 1.2. Drobne elementy gospodarstw

Dodać proste elementy otoczenia sugerujące codzienne życie mieszkańców, np.:

- beczki,
- inne niewielkie propsy gospodarskie, jeśli naturalnie pasują do istniejącej wioski.

Elementy mogą być początkowo wyłącznie dekoracyjne.

### 1.3. Studnia

Poprawić obecny model studni:

- bardziej dopracowany wizualnie,
- lepiej pasujący do zabudowy wioski,
- spójny ze stylem pozostałych obiektów.

Nie wymaga to tworzenia nowej mechaniki studni.

---

## 2. Zwierzęta

### 2.1. Nowe dzikie zwierzęta

Dodać kilka nowych gatunków dzikich zwierząt.

Obecny lis nie wymaga ponownego dodawania.

Proponowane nowe gatunki:

- królik / zając,
- kaczka,
- dzik.

Nowe gatunki powinny korzystać z istniejącego systemu fauny i istniejących mechanizmów zachowania zamiast tworzyć osobne systemy AI.

Preferowane środowiska:

- królik/zając → łąki, polany, obrzeża lasów,
- kaczka → okolice wody,
- dzik → lasy i odpowiednie tereny leśne.

Ostateczny dobór oraz szczegóły implementacyjne powinny zostać zweryfikowane na podstawie aktualnego repozytorium i dostępnych assetów.

### 2.2. Zwierzęta udomowione

Dodać podstawowe gatunki zwierząt gospodarskich:

- koń,
- krowa,
- owca,
- kura.

Na tym etapie zwierzęta mają przede wszystkim wzbogacić świat i wioskę.

Powinny korzystać z istniejącego systemu zwierząt.

Przykładowe miejsca występowania:

- konie → gospodarstwa i okolice wioski,
- krowy → pastwiska/gospodarstwa,
- owce → pastwiska,
- kury → podwórza i okolice gospodarstw.

### 2.3. Różnica między dzikimi i udomowionymi zwierzętami

Zwierzęta powinny mieć różny stosunek do ludzi i wioski.

#### Dzikie zwierzęta

Dzikie zwierzęta:

- boją się ludzi i obecności wioski,
- powinny unikać zabudowań,
- podczas ucieczki powinny preferować kierunek oddalający je od wioski,
- nie powinny normalnie przechodzić przez centrum osady,
- drapieżniki również nie powinny traktować wioski jako naturalnego obszaru polowania.

Nie należy tworzyć twardej niewidzialnej ściany wokół wioski. Zachowanie powinno wynikać z preferencji/strachu przed ludźmi i zabudowaniami.

Przykład:

> Sarna uciekająca przed lisem powinna preferować ucieczkę poza wioskę, nawet jeśli oznacza to zmianę kierunku ucieczki.

### 2.4. Zwierzęta gospodarskie jako bezpieczne w wiosce

Zwierzęta gospodarskie nie powinny bać się ludzi ani mieszkańców wioski.

Powinny natomiast:

- bać się drapieżników,
- uciekać przed lisem i innymi drapieżnikami,
- podczas ucieczki móc kierować się w stronę gospodarstwa lub wioski,
- traktować zabudowania/gospodarstwa jako względnie bezpieczny obszar.

Przykład emergentnego zachowania:

> Lis goni kurę → kura ucieka w stronę gospodarstwa → wbiega między zabudowania → lis niechętnie wchodzi do bezpiecznego obszaru i może przerwać pościg.

Analogicznie:

> Lis goni owcę → owca ucieka w stronę wioski → po wejściu między zabudowania drapieżnik traci możliwość kontynuowania naturalnego pościgu.

Nie wymaga to tworzenia osobnego systemu AI. Należy wykorzystać i rozszerzyć istniejące mechanizmy ruchu, strachu, pościgu i unikania.

### 2.5. Poza zakresem zwierząt

Na tym etapie nie dodajemy:

- hodowli,
- rozmnażania,
- karmienia,
- produkcji zasobów,
- jazdy konnej,
- stajni jako osobnego systemu,
- rozbudowanej mechaniki gospodarstw.

Jeżeli istniejący system pozwala łatwo nadać zwierzętom proste zachowania charakterystyczne dla gatunku, można je wykorzystać, ale nie powinno to znacząco rozszerzać zakresu planu.

---

## 3. Naturalne akcenty świata

### 3.1. Polany kwiatów

Dodać proceduralne skupiska kwiatów:

- większe grupy zamiast pojedynczych losowych kwiatów,
- nieregularne, naturalne kształty,
- występowanie zależne od rodzaju terenu,
- różne wielkości skupisk,
- wykorzystanie istniejącej roślinności i systemów proceduralnych tam, gdzie ma to sens.

Celem jest tworzenie atrakcyjnych, charakterystycznych miejsc w świecie.

### 3.2. Skupiska kamieni

Dodać proceduralne skupiska kamieni:

- nieregularne grupy,
- różne rozmiary skupisk,
- rozmieszczenie zależne od terenu,
- naturalne występowanie np. w górach, przy wybrzeżu lub na odpowiednich terenach.

Skupiska mogą korzystać z istniejących zasobów `stones`, bez tworzenia nowej mechaniki zasobów.

---

## 4. Drobne poprawki świata

W ramach tego samego milestone'u warto poprawić najbardziej widoczne artefakty proceduralnego świata, jeśli ich naprawa jest niewielka.

### 4.1. Roślinność na drogach

Drzewa i inne duże elementy roślinności nie powinny pojawiać się bezpośrednio na drogach.

Należy uwzględnić drogi jako obszary, które powinny pozostać przejezdne/przechodnie.

### 4.2. Roślinność i obiekty przy zabudowaniach

Ograniczyć oczywiste przypadki:

- drzew wyrastających w budynkach,
- roślinności przenikającej przez budynki,
- kamieni pojawiających się wewnątrz budynków,
- innych ewidentnie nienaturalnych kolizji proceduralnie rozmieszczanych obiektów.

### 4.3. Przejście dla gracza i NPC

Drobne elementy świata nie powinny bez potrzeby:

- blokować dróg,
- blokować wejść do budynków,
- utrudniać ruchu NPC,
- tworzyć oczywistych przeszkód na trasach.

Nie chodzi o stworzenie pełnego systemu collision/placement validation, tylko o poprawienie najbardziej widocznych przypadków.

### 4.4. Ogólny world cleanup

Podczas implementacji agent powinien zwrócić uwagę na inne oczywiste artefakty proceduralnego generowania.

Jeżeli ich naprawa jest niewielka i naturalnie mieści się w zakresie tego milestone'u, można je poprawić.

Nie należy jednak rozszerzać planu do pełnego refaktoru generatora świata.

### 4.5. Naturalne generowanie drzew

Poprawić naturalność rozmieszczenia drzew:

- drzewa powinny mieć naturalną tendencję do zachowywania odstępów od siebie,
- odstęp nie powinien być twardym minimalnym dystansem — lokalnie drzewa mogą rosnąć bardzo blisko siebie,
- las powinien mieć naturalne zróżnicowanie zagęszczenia,
- drzewa tego samego gatunku powinny mieć większą szansę występowania w swoim sąsiedztwie, tworząc naturalne skupiska gatunkowe,
- należy unikać regularnych wzorców i sztucznie równomiernego rozmieszczenia,
- drzewa powinny mieć zróżnicowane rozmiary,
- część drzew powinna być mała, reprezentując młode, dopiero rosnące drzewa.

Celem jest uzyskanie wrażenia naturalnie rozwijającego się lasu, w którym występują zarówno pojedyncze drzewa, jak i mniejsze skupiska podobnych gatunków.

Szczegóły algorytmu i parametrów pozostają do ustalenia podczas implementacji.

---

## 5. Zasady projektowe

### 5.1. Wykorzystywać istniejące systemy

Plan powinien przede wszystkim rozszerzać istniejące mechanizmy:

- fauna → nowe gatunki,
- day/night → światła w domach,
- proceduralne rozmieszczanie → kwiaty i kamienie,
- istniejące assety/props → elementy gospodarstw,
- istniejące zachowania fauny → strach, ucieczka, pościg i unikanie wioski.

Nie tworzyć równoległych systemów, jeśli istniejący mechanizm można rozszerzyć.

### 5.2. Naturalne rozmieszczenie

Nowe elementy środowiska powinny mieć naturalne preferencje zależne od terenu.

Przykładowo:

- zwierzęta powinny pojawiać się w odpowiednich środowiskach,
- kwiaty powinny tworzyć polany,
- kamienie powinny tworzyć skupiska,
- zwierzęta gospodarskie powinny koncentrować się wokół gospodarstw i wioski.

Szczegóły algorytmów, parametrów i progów pozostają do ustalenia podczas implementacji.

### 5.3. Świat jako system naczyń połączonych

Nowe elementy powinny wzmacniać istniejące zależności:

- wioska wpływa na zwierzęta,
- zwierzęta reagują na ludzi,
- drapieżniki wpływają na zwierzęta gospodarskie,
- teren wpływa na rozmieszczenie zwierząt i roślinności,
- pora dnia wpływa na wygląd wioski.

Nie chodzi o stworzenie kolekcji niezależnych dekoracji.

### 5.4. Visual polish ponad mechaniki

Priorytetem jest:

1. widoczność efektu,
2. naturalność świata,
3. spójność wizualna,
4. niski koszt implementacji.

Nie należy rozszerzać zakresu o duże mechaniki tylko dlatego, że nowe elementy potencjalnie mogłyby być interaktywne.

---

## 6. Weryfikacja przed implementacją

Agent implementacyjny powinien przed rozpoczęciem:

- sprawdzić, jakie gatunki zwierząt już istnieją,
- sprawdzić dostępne assety,
- sprawdzić istniejący system fauny,
- sprawdzić system dnia/nocy,
- sprawdzić istniejące mechanizmy proceduralnego rozmieszczania roślinności i zasobów,
- sprawdzić sposób reprezentowania wioski, dróg i zabudowy,
- zidentyfikować miejsca, które można rozszerzyć zamiast duplikować istniejącą logikę.

Nie jest celem tworzenie szczegółowego projektu architektury przed rozpoczęciem pracy.

Analiza repozytorium ma służyć przede wszystkim właściwemu dopasowaniu planu do istniejących systemów.

---

## 7. Poza zakresem

Na później pozostają m.in.:

- mrowiska,
- kretowiska,
- nory,
- owady,
- dodatkowe ambientowe stworzenia,
- rozbudowana hodowla,
- rozmnażanie zwierząt,
- jazda konna,
- produkcja zasobów przez zwierzęta,
- rozbudowany system gospodarstw,
- pełny refaktor generatora świata.

---

## Kryterium sukcesu

Po implementacji świat powinien być zauważalnie bardziej atrakcyjny podczas zwykłego spacerowania.

Gracz powinien zobaczyć:

- oświetloną wioskę po zmroku,
- zwierzęta gospodarskie przy gospodarstwach,
- nowe dzikie zwierzęta w naturalnych miejscach,
- sensowne zachowanie zwierząt względem wioski,
- interakcję drapieżnik ↔ zwierzę gospodarskie ↔ bezpieczna wioska,
- beczki i inne drobne elementy gospodarstw,
- bardziej dopracowaną studnię,
- polany kwiatów,
- naturalne skupiska kamieni,
- drogi wolne od drzew i dużej roślinności,
- mniej oczywistych artefaktów proceduralnego generowania.

Całość powinna wzmacniać główną ideę Seedvale:

> **Plant the seed. Watch the world grow.**

Świat nie powinien wyglądać jak zbiór dekoracji rozmieszczonych dla gracza, ale jak miejsce, które **naturalnie funkcjonuje i ma własne życie**.

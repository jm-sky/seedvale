# Plan: 129 — Monety i sprzedaż działek

**Created:** 2026-08-16  
**Status:** `planned` 📋  
**Priority:** 🔴 high · **Effort:** L  
**Depends on:** ~~093~~  
**Domain:** `items-player`  
**Tags:** [settlements-npcs, quests-progression]

## Cel

Dodać do Seedvale pierwszą fizyczną walutę:

- `coin` jako normalny przedmiot w `Inventory`;
- monety jako nagrody za questy;
- możliwość posiadania monet w ekwipunku;
- działki należące do osad, wystawione na sprzedaż;
- fizyczną tabliczkę z ceną przy działce;
- zakup działki przez gracza za monety;
- trwałe zapisanie własności działki.

**Plan kończy się na zakupie działki.**

Nie implementujemy jeszcze budowy domu.

---

# 1. Założenia projektowe

## 1.1. Moneta jest fizycznym itemem

Nie tworzyć osobnego:

```ts
player.money
```

ani osobnego systemu portfela.

Moneta jest częścią istniejącego:

```text
Inventory
└── coin × N
```

Dzięki temu późniejszy handel może korzystać z tego samego mechanizmu co wszystkie pozostałe przedmioty.

Monety mogą być w przyszłości:

- nagrodą;
- przedmiotem otrzymanym od NPC;
- wynikiem sprzedaży;
- zapłatą za towary/usługi;
- kosztem działki.

Nie implementować jednak jeszcze pełnego systemu ekonomii pieniężnej.

## 1.2. Nie tworzyć fizycznej monety jako osobnego mesh'a w świecie

`coin` jest fizycznym **itemem logicznym**, ale nie oznacza to konieczności renderowania pojedynczych monet.

Inventory przechowuje ilość:

```text
coin × 1250
```

Zwykły item stack.

---

# 2. Coin w Item Catalog

Dodać `coin` do istniejącego `ItemKind` / `ITEM_CATALOG`.

Przykładowa definicja:

```ts
coin: {
    name: 'Moneta',
    ...
}
```

Wykorzystać istniejące pola i mechanizmy katalogu.

Nie tworzyć osobnego `CurrencyCatalog`.

## 2.1. Stackowanie

Monety muszą być stackowalne.

Przykład:

```text
Moneta × 1250
```

Wykorzystać istniejącą semantykę stacków Inventory.

## 2.2. Item metadata

Nie dodawać na tym etapie:

- różnych nominałów;
- srebrnych/złotych monet;
- wartości nominalnej itemu;
- walut regionalnych.

Jedna moneta = jedna jednostka.

---

# 3. Inventory API

Wykorzystać istniejący Inventory.

Jeżeli obecne API nie ma wygodnego mechanizmu dla operacji typu:

```ts
hasItem(kind, quantity)
addItem(kind, quantity)
removeItem(kind, quantity)
```

należy go rozszerzyć zamiast pisać specjalne operacje dla monet.

Potrzebny flow:

```text
has coin × price
       ↓
remove coin × price
```

## 3.1. Atomowość zakupu

Zakup działki nie może wykonać:

```text
remove coins
→ później sprawdzenie działki
```

Najpierw wszystkie warunki muszą zostać sprawdzone:

```text
działka istnieje
↓
działka jest available
↓
gracza nie jest właścicielem
↓
gracza ma wystarczającą liczbę monet
↓
transakcja
```

Dopiero wtedy:

```text
remove coins
+
set ownership
```

W przypadku błędu żadna część transakcji nie może zostać wykonana.

---

# 4. Quest rewards

Istniejący system questów powinien zostać rozszerzony o monety jako zwykły item reward.

Nie tworzyć:

```ts
moneyReward
```

jeżeli istnieje już ogólny mechanizm nagród przedmiotowych.

Preferowany model:

```ts
reward: {
    items: [
        {
            kind: 'coin',
            quantity: 50,
        },
    ],
}
```

lub odpowiednik zgodny z istniejącym `QuestDef`.

## 4.1. Przykładowe nagrody

Na potrzeby testów można dodać / rozszerzyć istniejące questy:

```text
Zagubiona owca       → 10 monet
Drewno na naprawę    → 15 monet
Wilcza jama          → 40 monet
Groźny wilk          → 50 monet
```

Dokładne wartości są kwestią balansu.

Nie tworzyć nowego systemu wypłaty.

## 4.2. Ważne

Quest completion powinien korzystać z istniejącego lifecycle:

```text
quest completed
→ istniejące effects/rewards
→ Inventory.addItem(coin, amount)
```

Nie dodawać specjalnego callbacku:

```ts
player.addMoney(...)
```

---

# 5. Działki osady

Wykorzystać istniejącą architekturę `VillagePlan`.

Nie tworzyć niezależnego systemu parcel niezwiązanego z generacją osady.

Obecny generator już operuje na:

- tożsamości osady;
- strefach;
- działkach;
- budynkach;
- landmarkach;
- ścieżkach.

Nowa działka sprzedażowa powinna być kolejnym typem danych generowanym w tym samym planie.

## 5.1. LandPlot

Dodać data-only definicję w odpowiednim module settlement:

```ts
type LandPlot = {
    id: string
    position: Vector2 / Vector3
    rotation: number
    width: number
    depth: number
    price: number
}
```

Runtime może dodatkowo posiadać:

```ts
owner: 'player' | null
```

Nie duplikować danych pozycji/footprintu, jeżeli istniejący `VillagePlan` ma już odpowiedni typ działki, który można rozszerzyć.

**Najpierw sprawdzić istniejący model działek i rozszerzyć go zamiast tworzyć drugi.**

---

# 6. Generowanie działek sprzedażowych

Osada może mieć przeznaczoną na sprzedaż działkę.

Nie każda osada musi mieć działkę.

Pierwsza wersja:

```text
small settlement → 0–1
medium settlement → 0–1
large settlement → 0–2
```

Dokładne wartości mogą zostać zmienione po testach.

## 6.1. Lokalizacja

Działka powinna:

- znajdować się w granicach osady;
- być odpowiednio płaska;
- znajdować się poza istniejącymi domami;
- nie kolidować z drogami;
- nie kolidować z ogrodami/polami;
- nie zajmować ważnego landmarku;
- mieć sensowny dostęp do lokalnej drogi.

Preferować obrzeża osady.

## 6.2. Determinizm

Działka musi być częścią deterministycznego `VillagePlan`.

Ten sam:

```text
world seed
+
settlement identity
```

powinien wygenerować tę samą działkę.

Nie szukać losowego miejsca dopiero po wejściu gracza do osady.

---

# 7. Cena działki

Cena jest częścią definicji działki:

```ts
price: number
```

Cena wyrażona jest w liczbie `coin`.

Przykład:

```text
small   → 500
medium  → 1200
large   → 2500
```

To są wartości początkowe do balansu, nie sztywna reguła systemu.

## 7.1. Konfiguracja

Ceny powinny być łatwe do zmiany.

Nie:

```ts
if (plot.size === 'medium') price = 1200
```

w kodzie interakcji.

Preferowany jest istniejący mechanizm konfiguracji/danych świata.

## 7.2. Nie implementować dynamicznych cen

Cena nie zależy jeszcze od:

- podaży;
- popytu;
- reputacji;
- bogactwa osady;
- lokalizacji;
- liczby mieszkańców.

To może pojawić się później.

---

# 8. Tabliczka sprzedażowa

Każda dostępna działka otrzymuje fizyczną tabliczkę.

Wykorzystać istniejący settlement props pipeline oraz istniejące mechanizmy tabliczek/signów, jeśli są dostępne.

Nie tworzyć osobnego systemu renderowania znaków.

## 8.1. Wygląd

Minimalnie:

```text
NA SPRZEDAŻ

1200 🪙
```

Tabliczka powinna:

- znajdować się przy działce;
- być czytelna z poziomu gracza;
- mieć sensowny kierunek względem drogi;
- należeć do settlement props;
- być usuwana razem z osadą podczas stream-out.

## 8.2. Dane interakcji

Tabliczka musi znać:

```ts
settlementId
plotId
```

Nie przechowywać w niej całego `LandPlot`.

Interakcja pobiera aktualny stan działki z właściwego ownera danych.

---

# 9. Interakcja z działką

Po podejściu do tabliczki:

```text
[E] Kup działkę — 1200 🪙
```

Wykorzystać istniejący system `Interactable`.

Nie tworzyć specjalnego input systemu dla nieruchomości.

## 9.1. Touch

Interakcja powinna działać również przez istniejący alternatywny/touch interaction flow.

Nie zakładać wyłącznie klawisza `E`.

---

# 10. Zakup działki

Flow:

```text
Player
  ↓
Land Plot Sign
  ↓
Interaction
  ↓
validatePlotPurchase()
  ↓
hasItem(coin, price)
  ↓
removeItem(coin, price)
  ↓
setPlotOwner(player)
```

## 10.1. Walidacja

Zakup możliwy tylko jeśli:

- działka istnieje;
- osada istnieje;
- działka jest `available`;
- cena > 0;
- gracz posiada wystarczającą liczbę monet;
- działka nie ma właściciela.

## 10.2. Brak pieniędzy

Nie usuwać żadnych itemów.

Pokazać komunikat:

```text
Nie stać cię na tę działkę.
Potrzebujesz 1200 monet.
```

Można dodatkowo pokazać:

```text
Masz: 850
Brakuje: 350
```

jeżeli obecny UI system pozwala to zrobić bez tworzenia dużego nowego ekranu.

---

# 11. Własność działki

Po zakupie:

```ts
owner = 'player'
```

lub odpowiednik zgodny z istniejącym modelem własności.

Nie przypisywać własności na podstawie pozycji gracza ani UUID runtime obiektu.

Własność musi być stabilnym stanem świata.

## 11.1. Stan działki

Minimalnie:

```text
available
owned
```

Nie potrzebujemy jeszcze:

```text
building
occupied
abandoned
forSale
```

To będzie potrzebne dopiero przy dalszym rozwoju.

---

# 12. Osada jako odbiorca pieniędzy

Zakup powinien mieć semantykę:

```text
Player Inventory
    - price coins

Settlement
    + price coins
```

Ale **nie należy jeszcze budować pełnego systemu pieniędzy osady**, jeżeli `SettlementEconomy` nie posiada obecnie takiego mechanizmu.

Można przygotować prosty stan:

```ts
treasury
```

tylko jeżeli istniejąca architektura ekonomii naturalnie tego wymaga.

W przeciwnym razie zakup może na tym etapie rejestrować wpływ bez wprowadzania kolejnej warstwy ekonomii.

Decyzja implementacyjna powinna wynikać z istniejącego `SettlementEconomy`.

**Nie tworzyć równoległego `SettlementMoney`.**

---

# 13. Persistence

Zakup działki jest trwałym stanem świata.

Po reloadzie:

```text
działka nadal należy do gracza
```

Minimalny zapis:

```ts
playerLandPlots: {
    [plotId]: {
        owner: 'player'
    }
}
```

albo lepiej — wykorzystać istniejącą strukturę persistent world state, jeśli taka już istnieje.

Nie zapisywać całego wygenerowanego settlementu.

Nie zapisywać:

- meshów;
- tabliczki;
- transformów renderowanych obiektów;
- assetów.

Po reloadzie dane zostaną ponownie zmaterializowane z `VillagePlan`.

---

# 14. Streaming

Działka musi zachować własność podczas:

```text
settlement stream-out
        ↓
settlement stream-in
```

`LandPlot` w `VillagePlan` jest statyczną definicją.

Stan:

```text
owner = player
```

jest persistent state.

Przy ponownym stream-in:

```text
VillagePlan
+
persistent ownership
→
LandPlot runtime
→
tabliczka / brak tabliczki
```

## 14.1. Tabliczka po zakupie

Po zakupie tabliczka sprzedażowa nie może wrócić po stream-in.

Dla:

```text
owner === player
```

nie renderować:

```text
NA SPRZEDAŻ
```

---

# 15. Save migration

Rozszerzyć istniejący `SaveData`.

Stare save'y:

```text
brak player-owned plots
```

oznaczają:

```text
brak zakupionych działek
```

Bez błędu i bez konieczności resetowania save.

---

# 16. Debug

Dodać minimalny debug informacji o działkach.

Przydatne będzie np.:

```text
plot abc
price 1200
owner player
```

Nie tworzyć osobnego debug UI.

Jeżeli istnieje obecny debug overlay settlementu, rozszerzyć go.

---

# 17. Testy

## 17.1. Item

Sprawdzić:

- `coin` istnieje w katalogu;
- można dodać monety;
- monety stackują się;
- można usunąć określoną liczbę;
- nie można usunąć większej liczby niż posiadana.

## 17.2. Quest

Sprawdzić:

```text
quest complete
→ coin reward
→ Inventory +N
```

oraz brak podwójnej nagrody przy ponownym wywołaniu completion.

## 17.3. Purchase

Testy:

1. 1000 monet, działka 500 → sukces.
2. 500 monet, działka 500 → sukces, saldo 0.
3. 499 monet, działka 500 → brak zakupu.
4. brak monet → brak zakupu.
5. zakupiona działka → drugi zakup niemożliwy.
6. cena = 0 → odrzucona definicja / bezpłatna działka nieprzewidziana w V1.
7. po nieudanym zakupie Inventory pozostaje bez zmian.

## 17.4. Persistence

```text
buy
→ save
→ reload
→ plot owned
```

## 17.5. Streaming

```text
buy
→ oddal się od settlementu
→ stream-out
→ wróć
→ stream-in
→ plot nadal owned
→ sign nie jest „for sale”
```

---

# 18. Browser verification

Weryfikacja przeglądarkowa jest obowiązkowa.

Pełny scenariusz:

```text
1. Znajdź osadę z działką.
2. Podejdź do tabliczki.
3. Sprawdź cenę.
4. Zdobądź monety przez quest.
5. Sprawdź Inventory.
6. Wróć do działki.
7. Kup działkę.
8. Sprawdź odjęcie monet.
9. Sprawdź zmianę stanu tabliczki.
10. Oddal się na tyle, aby osada się odstreamowała.
11. Wróć.
12. Sprawdź własność działki.
13. Zapisz grę.
14. Przeładuj.
15. Sprawdź własność ponownie.
```

Dodatkowo:

- sprawdzić małą i większą osadę;
- sprawdzić kilka seedów;
- sprawdzić kolizje działki z domami/drogami;
- sprawdzić tabliczkę z różnych kierunków;
- sprawdzić desktop + touch.

---

# 19. Poza zakresem

Ten plan **nie implementuje**:

- budowania domu;
- House Builder integration;
- preview domu;
- kosztów materiałów;
- sprzedaży domu;
- sprzedaży działki przez gracza;
- działek NPC;
- kupowania działek przez NPC;
- banków;
- różnych walut;
- dynamicznych cen;
- podatków;
- wynagrodzeń NPC;
- pełnego systemu handlu;
- fizycznych meshów monet;
- osobnego portfela.

---

# 20. Późniejsze rozszerzenia

Po tym planie naturalna ścieżka wygląda tak:

```text
[129] Monety + zakup działki
          ↓
       handel
          ↓
   ceny towarów
          ↓
  zarobki NPC / praca
          ↓
   ekonomia osady
          ↓
   ┌───────────────┐
   ↓               ↓
budowa domu      usługi
   ↓
własna nieruchomość
```

Zakup działki jest więc pierwszym **realnym zastosowaniem pieniędzy**, ale nie wymaga jeszcze budowania całego systemu ekonomicznego.

## Kryterium ukończenia

Plan jest ukończony, gdy:

- `coin` jest zwykłym stackowalnym itemem;
- quest może przyznać monety;
- osada może deterministycznie wygenerować działkę sprzedażową;
- działka ma cenę;
- przy działce znajduje się tabliczka;
- gracz może kupić działkę za monety;
- monety są prawidłowo odejmowane;
- działka przechodzi w stan własności gracza;
- zakup przetrwa save/load;
- zakup przetrwa settlement stream-out/in;
- nie ma jeszcze żadnej logiki budowania domu;
- testy techniczne przechodzą;
- pełny zakup został sprawdzony w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

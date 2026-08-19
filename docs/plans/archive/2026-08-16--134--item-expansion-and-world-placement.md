# Plan: Item Expansion & World Placement

**Created:** 2026-08-16  
**Status:** `done` ✅ — playtest 2026-08-18 (see [implementation notes](./2026-08-16--134--item-expansion-and-world-placement-implementation-notes.md) §16)  
**Priority:** medium · **Effort:** M  
**Depends on:** none

domain: items-player

tags: [settlements-npcs]

## Cel

Rozszerzyć system przedmiotów o około **10–20 nowych itemów**, wykorzystując dostępne modele i istniejące mechanizmy Seedvale.

Nowe przedmioty powinny mieć sens w świecie i być powiązane z istniejącymi systemami, zamiast stanowić wyłącznie dodatkową dekorację.

## Zakres

### 1. Nowe przedmioty

Dodać około 10–20 przedmiotów, zależnie od:

- dostępnych modeli,
- możliwości istniejącego systemu itemów,
- sensownych zastosowań,
- możliwości rozmieszczenia ich w świecie.

Przykładowe grupy:

- różne rodzaje jedzenia,
- mięso różnych gatunków zwierząt,
- broń,
- nowe naczynie / pojemnik na wodę,
- inne użyteczne przedmioty wynikające z istniejących systemów.

**Wymagane itemy:**

- dzida,
- krótki miecz.

Brak modelu 3D nie może blokować dodania przedmiotu. Jeśli odpowiedniego assetu nie ma, item powinien nadal istnieć w systemie, być dostępny w inventory i posiadać Item Details. Reprezentacja 3D w świecie może zostać dodana później.

Nie ustalać sztywnej liczby 20 — jakość i integracja z istniejącym światem są ważniejsze.

### 2. Mięso jako bardziej elastyczny typ itemu

Mięso może być rozróżniane według gatunku, np.:

- mięso sarny,
- mięso wilka,
- mięso dzika,
- mięso królika,
- mięso krowy.

Nie tworzyć osobnych wariantów dla każdej kombinacji gatunku i stanu świeżości.

Rozważyć właściwości:

- `species` — gatunek,
- `quantity` — liczba jednostek,
- `massPerUnit` / masa,
- `freshness` — np. `fresh`, `aged`, `spoiled`.

Masa powinna pozwalać zachować różnicę między zwierzętami o różnej wielkości — królik i krowa nie powinny generować identycznej ilości mięsa.

Mechanizm powinien być przygotowany tak, aby w przyszłości mógł obsługiwać:

- starzenie się mięsa,
- psucie,
- porcjowanie,
- przechowywanie,
- transport,
- wagę ekwipunku,
- wartość handlową,
- konsumpcję.

Nie rozbudowywać jednak zakresu planu o pełny system perishables, jeśli istniejący kod nie daje do tego podstaw.

### 3. Dostępne modele

Sprawdzić istniejące assety i wykorzystać modele z grupy **„zaparkowanych”** — modeli przygotowanych, ale obecnie niewykorzystywanych.

Nie zakładać z góry, że każdy model musi zostać użyty.

Priorytetem jest sensowne wykorzystanie istniejących assetów zamiast dodawania nowych zależności lub modeli bez potrzeby.

### 4. Rozmieszczenie przedmiotów w świecie

Nowe itemy powinny pojawiać się w świecie z uzasadnieniem.

Przykładowo:

- u kupca,
- w domach,
- przy stanowiskach pracy,
- w magazynach,
- przy miejscach związanych z produkcją,
- jako pozostawione / porzucone przedmioty,
- w odpowiednich miejscach świata.

Wykorzystać istniejące mechanizmy placementu, inventory, merchantów i world state tam, gdzie są dostępne.

Unikać tworzenia osobnego systemu wyłącznie do rozmieszczania nowych itemów.

### 5. Inventory Item Details

Rozbudować stronę **Inventory Item Details** o brakujące informacje.

W zależności od typu przedmiotu uwzględnić m.in.:

- kategorię,
- typ,
- prędkość,
- zasięg,
- masę / ilość, jeśli dostępne,
- szacunkową cenę,
- inne istniejące parametry właściwe dla danego itemu.

Nie wyświetlać bezsensownych parametrów dla każdego typu itemu — UI powinno uwzględniać właściwości konkretnego przedmiotu.

### 6. Miejsce na grafikę przedmiotu

Przygotować w **Inventory Item Details** miejsce na przyszły obraz / render itemu.

Na tym etapie nie jest konieczne tworzenie osobnych grafik.

Jako fallback wykorzystać ikonę odpowiadającą kategorii przedmiotu.

Architektura UI powinna pozwalać później łatwo zastąpić ikonę właściwym obrazem itemu.

## Zasady implementacji

- Najpierw sprawdzić istniejący system itemów i jego modele danych.
- Rozszerzać istniejące mechanizmy zamiast tworzyć równoległe systemy.
- Nie kodować parametrów wyłącznie pod nowe itemy, jeśli mogą być częścią wspólnego modelu.
- Nie tworzyć osobnych itemów dla kombinacji typu/gatunku/stanu, jeśli można reprezentować je właściwościami.
- Zachować możliwość późniejszego rozszerzenia systemu o masę, świeżość, porcjowanie i inne właściwości.
- Nowe itemy powinny mieć zastosowanie lub logiczne miejsce w świecie.
- Nie dodawać modeli tylko po to, aby zwiększyć liczbę itemów.
- Brak assetu 3D nie może blokować istnienia itemu w inventory.

## Rezultat

Po zakończeniu Seedvale powinno posiadać:

- około 10–20 dodatkowych przedmiotów,
- dzidę i krótki miecz jako pełnoprawne itemy niezależnie od dostępności modeli 3D,
- większą różnorodność jedzenia i wyposażenia,
- mięso różniące się gatunkiem i potencjalnie masą / świeżością,
- wykorzystane wybrane istniejące modele,
- nowe przedmioty logicznie obecne w świecie,
- bogatszy ekran Inventory Item Details,
- przygotowane miejsce na przyszłe grafiki itemów,
- model danych możliwy do dalszego rozszerzania bez mnożenia wariantów przedmiotów.

## Weryfikacja

Sprawdzić:

- wszystkie dodane itemy można poprawnie utworzyć i wyświetlić,
- dzida i krótki miecz działają jako itemy nawet bez modeli 3D,
- Inventory Item Details pokazuje właściwe parametry,
- parametry nie pojawiają się dla niepasujących typów itemów,
- nowe modele poprawnie renderują się w świecie,
- placement wykorzystuje istniejące mechanizmy,
- itemy pojawiają się w logicznych miejscach,
- istniejące itemy i inventory nadal działają poprawnie,
- build i testy przechodzą.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

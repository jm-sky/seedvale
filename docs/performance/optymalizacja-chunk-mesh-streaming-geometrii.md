# Optymalizacja: Chunk mesh — streaming geometrii

Celem jest ograniczenie hitchy powodowanych przez generowanie geometrii chunków podczas streamingu świata.

Benchmark `stream` wykazał:

* `51` hitchy związanych z `chunk mesh`,
* średnio **45.5 ms**,
* maksimum **92.6 ms**.

Proponowany zakres obejmuje trzy powiązane optymalizacje.

## 1. Chunk mesh → istniejący worker

### Co

Przenieść CPU-heavy część generowania chunk mesh do **istniejącego workera**.

Worker generuje dane geometrii, m.in.:

* vertices,
* indices,
* normals,
* colors i inne wymagane atrybuty.

Main thread pozostaje odpowiedzialny za utworzenie `THREE.BufferGeometry` / `THREE.Mesh` i podłączenie go do sceny.

Nie przenosimy obiektów Three.js do workera — worker operuje wyłącznie na danych.

### Jak

Docelowy przepływ:

```
Main Thread
    ↓
request chunk generation
    ↓
Worker
    ↓
generate mesh data
    ↓
Transferable ArrayBuffers
    ↓
Main Thread
    ↓
BufferGeometry
    ↓
Scene
```

### Potencjalny zysk

Szacunkowo **30–80% redukcji main-thread hitcha**.

Orientacyjnie:

```
45.5 ms → ~10–30 ms
92.6 ms → ~20–50 ms
```

Najważniejszy efekt nie musi być proporcjonalnym zmniejszeniem całkowitego CPU work. Kluczowe jest przeniesienie kosztownej pracy poza main thread, dzięki czemu generowanie chunków nie będzie w takim stopniu blokować renderowania i interakcji.

### Dlaczego nie robimy dodatkowego researchu

Mamy już wystarczające dane do podjęcia decyzji:

* problem jest powtarzalny,
* występuje `51` razy podczas benchmarku,
* koszt wynosi średnio `45.5 ms`,
* maksimum to `92.6 ms`,
* generowanie geometrii jest CPU-heavy,
* projekt posiada już mechanizm workerów.

Dodatkowy research odpowiedziałby głównie na pytanie **„jak duża dokładnie będzie poprawa?”**.

Nie jest to potrzebne przed implementacją. Rzeczywisty zysk zmierzymy po zmianie przez ponowne wykonanie tego samego benchmarku.

---

## 2. Optymalizacja alokacji/kopii przy okazji

### Co

Podczas przenoszenia generowania do workera uporządkować również przepływ danych między workerem i main thread, żeby nie zastąpić jednego problemu innym.

W szczególności:

* używać `TypedArray`,
* przekazywać duże bufory jako **Transferable Objects**,
* unikać niepotrzebnego `structured clone`,
* ograniczyć tworzenie tymczasowych tablic,
* ograniczyć zbędne resize/realloc,
* unikać dodatkowych kopii danych,
* tworzyć `BufferAttribute` bez dodatkowego kopiowania, jeśli aktualny pipeline na to pozwala.

### Potencjalny zysk

Szacunkowo **5–20% dodatkowej redukcji kosztu streamingu/generowania**.

Nie jest to jednak główny cel optymalizacji. Największą wartością pozostaje przeniesienie kosztownej pracy poza main thread.

### Dlaczego robimy to przy okazji

Zmiana granicy:

```
worker ↔ main thread
```

jest naturalnym momentem na uporządkowanie ownership danych i sposobu ich transferowania.

Nie ma sensu robić osobnego researchu ani budować osobnego benchmarku przed implementacją.

Jeżeli znajdziemy zbędne kopie lub alokacje — usuwamy je.

Jeżeli aktualny pipeline już efektywnie wykorzystuje Transferable ArrayBuffers — nie komplikujemy go bez potrzeby.

---

## 3. Cache gotowej geometrii

### Co

Dodać cache wyników generowania chunk mesh.

Cache nie powinien przechowywać obiektów Three.js. Powinien przechowywać **dane potrzebne do odtworzenia geometrii**, tak aby ponowne użycie chunku nie wymagało ponownego wykonywania kosztownej generacji.

Przepływ:

```
chunk request
    ↓
cache lookup
    ↓
HIT ─────────────→ cached mesh data
    │
    │ MISS
    ▼
worker generation
    ↓
cache
    ↓
BufferGeometry
```

### Kiedy daje największy efekt

Szczególnie przy:

* opuszczaniu i ponownym wejściu w obszar,
* streamingu wokół poruszającego się gracza,
* unload/reload chunków,
* powracaniu do wcześniej odwiedzonych obszarów.

Przy cache hit koszt ponownej generacji CPU może zostać praktycznie wyeliminowany.

### Bezpieczeństwo cache

Cache musi uwzględniać wszystkie dane wpływające na wynik geometrii.

Jeżeli zmieni się stan świata lub inny parametr wpływający na mesh, stary wynik nie może zostać wykorzystany bez odpowiedniej invalidacji.

Cache powinien mieć również kontrolowany rozmiar i mechanizm eviction, aby nie zamienić optymalizacji CPU w problem pamięci.

### Potencjalny zysk

Dla cache hit:

```
koszt generowania geometrii ≈ 0 ms
```

Nie zakładamy konkretnego procentowego wzrostu FPS, ponieważ całkowity efekt zależy od **cache hit rate**.

To optymalizacja usuwająca powtarzalną pracę, a nie przyspieszająca pierwszą generację chunku.

### Dlaczego nie robimy dodatkowego researchu

Nie ma potrzeby wcześniej mierzyć potencjalnego hit rate.

Jasne jest, że:

```
cache hit < ponowna generacja
```

Natomiast rzeczywisty hit rate można zmierzyć po implementacji podczas normalnego streamingu.

Dlatego również tutaj właściwy cykl to:

```
implementacja → benchmark → pomiar cache hit rate → decyzja o dalszym tuningu
```

---

### Łączny kierunek

Trzy optymalizacje tworzą jeden spójny pipeline:

```
┌──────────────────────────────┐
│ Main Thread                  │
│                              │
│ request chunk                │
└──────────────┬───────────────┘
               │
               ▼
         ┌───────────┐
         │   Cache   │
         └─────┬─────┘
               │ miss
               ▼
         ┌───────────┐
         │  Worker   │
         │           │
         │ generate  │
         │ mesh data │
         └─────┬─────┘
               │
        Transferable
          ArrayBuffers
               │
               ▼
         ┌───────────┐
         │   Three   │
         │ BufferGeo │
         └───────────┘
```

Główna oczekiwana korzyść:

**generowanie chunk mesh przestaje blokować main thread w obecnym stopniu, a cache dodatkowo eliminuje koszt ponownej generacji wcześniej przygotowanych chunków.**

Nie wykonujemy kolejnego researchu przed implementacją. Mamy wystarczająco mocny sygnał z benchmarku, a rzeczywisty efekt każdej optymalizacji będzie bardziej wartościowy jako wynik **A/B benchmarku po implementacji** niż jako wcześniejsza estymacja.

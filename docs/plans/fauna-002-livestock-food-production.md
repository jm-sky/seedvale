# Plan: Livestock Food Production

**Created:** 2026-08-27  
**Status:** `verification needed` 🔍 — see [implementation notes](./implementation-notes/fauna-002-livestock-food-production-implementation-notes.md)  
**Priority:** medium · **Effort:** M  
**Depends on:** `items-player-001`  
**Domain:** `fauna`

## 1. Cel

Dodać produkcję podstawowych produktów spożywczych przez zwierzęta gospodarskie:

- kury → jajka,
- krowy → mleko,
- owce → mleko.

Produkty powstają w wyniku naturalnego cyklu życia zwierząt i mogą być zbierane przez gracza lub NPC.

Plan zakłada, że system pojemników i wiader został wcześniej przygotowany w `items-player-001-containers-waterskins-and-copper-items.md`.

Ten plan nie implementuje craftingu, gotowania ani przetwarzania produktów.

---

# 2. Kury → jajka

Każda kura może produkować jajka.

Produkcja jest indywidualna dla każdej kury.

## 2.1. Cykl produkcji

Każda kura posiada własny timer/cooldown produkcji jajka.

Koncepcyjnie:

```text
kura
 ↓
timer produkcji
 ↓
jajko gotowe
 ↓
pozostawione w świecie / możliwe do zebrania
 ↓
zebranie jajka
 ↓
kolejny cykl
```

Timer powinien być częścią stanu konkretnej kury, a nie globalnym timerem wszystkich kur.

Po zakończeniu cyklu kura może wyprodukować jedno jajko.

Kura nie powinna gromadzić nieograniczonej liczby niezebranych jaj. Docelowo powinna mieć maksymalnie jedno aktywne/niezebrane jajko.

Po zebraniu jajka może rozpocząć kolejny cykl produkcji.

## 2.2. Interakcja z kurą

Interakcja z kurą może umożliwić znalezienie/zebranie jajka.

Stan powinien być uwzględniany:

```text
brak gotowego jajka
→ brak akcji zebrania

gotowe jajko
→ dostępna akcja zebrania
```

Szczegółowe okno i sposób prezentacji akcji zapewnia istniejący system interakcji/UX.

## 2.3. Pozostawianie jajek w świecie

Kura może pozostawić jajko w miejscu, w którym przebywa.

Jajko nie powinno być przypisane na stałe do punktu spawnu.

Miejsce pozostawienia powinno wynikać z aktualnej pozycji kury i istniejących mechanizmów umieszczania przedmiotów w świecie.

Przykład:

```text
kura chodzi po podwórku
        ↓
produkcja jajka
        ↓
jajko zostaje na ziemi
        ↓
kura może odejść
        ↓
gracz/NPC może znaleźć i zebrać jajko
```

Jajko pozostawione w świecie powinno być normalnym itemem możliwym do zebrania przez istniejący system itemów.

---

# 3. Krowy → mleko

Krowy produkują mleko, które można uzyskać przez dojenie.

## 3.1. Ilość mleka

Jedno dojenie krowy daje:

**5 l mleka**

Ilość powinna być wartością konfiguracyjną gatunku/zwierzęcia, a nie wartością zakodowaną bezpośrednio w logice interakcji.

## 3.2. Dojenie

Dojenie jest czynnością trwającą w czasie, a nie natychmiastową akcją.

Dojenie wymaga odpowiedniego pustego lub częściowo pustego pojemnika.

Podstawowym pojemnikiem jest wiadro zdefiniowane w `items-player-001-containers-waterskins-and-copper-items.md`.

Przykład:

```text
krowa
+
puste drewniane wiadro 10 l
        ↓
rozpoczęcie dojenia
        ↓
czynność w czasie
        ↓
5 l mleka
        ↓
drewniane wiadro
milk: 5 / 10 l
```

### Czas dojenia

Czas dojenia powinien zależeć od ilości mleka, które ma zostać pozyskane.

Większa ilość mleka oznacza proporcjonalnie dłuższą czynność.

```text
2 l mleka → krótsze dojenie
5 l mleka → dłuższe dojenie
```

Dokładny czas bazowy należy dobrać podczas implementacji i zapisać jako wartość konfiguracyjną.

Nie kodować czasu bezpośrednio w logice interakcji.

### Przyspieszenie czasu

Podczas dojenia należy wykorzystać istniejący mechanizm czynności/czasu gry oraz dostępne mechanizmy przyspieszania czasu.

Nie tworzyć osobnego systemu przyspieszania czasu dla dojenia.

Koncepcyjnie:

```text
rozpoczęcie dojenia
        ↓
czynność aktywna
        ↓
czas gry płynie
        ↓
progress czynności
        ↓
zakończenie
        ↓
mleko trafia do wiadra
```

Przyspieszenie czasu powinno przyspieszać również postęp dojenia zgodnie z istniejącymi zasadami systemu czynności.

### Przerwanie

Jeżeli istniejący system czynności obsługuje anulowanie/przerwanie czynności, dojenie powinno z niego korzystać.

Nie dodawać osobnego mechanizmu anulowania tylko dla dojenia.

W przypadku przerwania przed zakończeniem:

- nie przyznawać pełnej ilości mleka,
- zachować spójność stanu krowy i pojemnika,
- zastosować istniejące zasady anulowania czynności.

---

# 4. Owce → mleko

Owce korzystają z tej samej ogólnej mechaniki produkcji mleka co krowy.

Różnica wynika z konfiguracji gatunku.

## 4.1. Ilość mleka

Jedno dojenie owcy daje:

**2 l mleka**

Jest to mniej niż w przypadku krowy.

| Zwierzę | Produkt | Ilość |
|---|---|---:|
| Krowa | mleko | **5 l** |
| Owca | mleko | **2 l** |

## 4.2. Dojenie

Owca wymaga odpowiedniego pojemnika, analogicznie do krowy.

Przykład:

```text
owca
+
puste wiadro 10 l
        ↓
rozpoczęcie dojenia
        ↓
czynność w czasie
        ↓
2 l mleka
        ↓
wiadro
milk: 2 / 10 l
```

Po dojeniu obowiązuje cooldown.

Czas dojenia powinien odpowiadać ilości pozyskiwanego mleka, więc dojenie owcy powinno trwać krócej niż dojenie krowy.

---

# 5. Wspólny system produkcji zwierzęcej

Nie tworzyć osobnych systemów:

```text
ChickenEggSystem
CowMilkSystem
SheepMilkSystem
```

Mechanika powinna być możliwie wspólna.

Różnice pomiędzy gatunkami powinny wynikać z konfiguracji.

Koncepcyjnie:

```text
LivestockProduction
├── production type
├── production amount
├── production interval
├── cooldown / next production time
└── produced item
```

Przykładowa konfiguracja:

```text
chicken
  product: egg
  amount: 1
  production: egg
```

```text
cow
  product: milk
  amount: 5 l
  production: milk
```

```text
sheep
  product: milk
  amount: 2 l
  production: milk
```

Nie należy tworzyć nowej abstrakcji, jeśli istniejący system zwierząt ma już odpowiednie mechanizmy stanu i timerów. W pierwszej kolejności należy rozszerzyć istniejący model.

---

# 6. Stan produkcji

Stan produkcji musi należeć do konkretnego zwierzęcia.

Nie stosować globalnych timerów typu:

```text
nextChickenEggTime
nextCowMilkTime
```

Każde zwierzę powinno mieć własny stan produkcji:

```text
animal
├── production state
├── next production time
└── produced/available state
```

Jest to ważne dla:

- różnych momentów narodzin zwierząt,
- zwierząt kupowanych/przenoszonych,
- zapisu gry,
- symulacji off-screen.

---

# 7. Produkcja a symulacja

Produkcja musi działać niezależnie od gracza i kamery.

Kura powinna móc wyprodukować jajko, nawet jeśli gracz znajduje się daleko.

Krowa i owca powinny mieć aktualny stan produkcji mleka również poza aktywnym obszarem gracza.

Należy wykorzystać istniejącą architekturę symulacji zwierząt i jej mechanizmy aktualizacji off-screen.

Nie tworzyć specjalnego systemu produkcji zależnego od renderowania.

---

# 8. Jajka jako przedmioty świata

Po pozostawieniu przez kurę jajko powinno stać się normalnym itemem świata.

Powinno:

- posiadać istniejący `ItemKind`,
- być możliwe do zebrania,
- być obsługiwane przez istniejący system itemów,
- być możliwe do przechowywania w inventory,
- podlegać istniejącemu systemowi persistence, jeżeli itemy świata są persystowane.

Nie tworzyć osobnego `EggEntity`, jeśli istniejący system itemów świata pozwala poprawnie obsłużyć jajko.

---

# 9. Mleko jako zawartość pojemnika

Mleko nie powinno być reprezentowane jako zwykły count itemu:

```text
milk: 5
```

jeżeli oznaczałoby to pięć niezależnych jednostek produktu.

Mleko jest zawartością pojemnika:

```text
bucket
├── capacity: 10 l
├── content: milk
└── amount: 5 l
```

Powinno wykorzystywać model pojemników przygotowany w `items-player-001`.

Dzięki temu później możliwe będzie wykorzystanie tego samego mechanizmu przez:

- wodę,
- mleko,
- inne płyny.

---

# 10. Produkty

## 10.1. `egg`

**Nazwa:** Jajko

Produkt pochodzący od kury.

Jest normalnym itemem świata/inventory.

## 10.2. `milk`

Mleko nie musi być osobnym itemem liczonym w inventory, jeżeli istniejący model pojemników przechowuje zawartość jako typ + ilość.

Należy wykorzystać istniejącą architekturę pojemników.

---

# 11. Interakcje

Szczegółowy UI/UX pozostaje poza zakresem tego planu.

System interakcji powinien jednak otrzymać możliwość wykrywania odpowiednich akcji.

Przykładowo:

```text
Krowa
 ├── Przyjrzyj się
 └── Wydoj krowę → [wiadro drewniane]
                  → [wiadro miedziane]
```

oraz:

```text
Kura
 ├── Przyjrzyj się
 └── Zbierz jajko
```

Lista dostępnych wariantów powinna zależeć od aktualnego stanu świata i inventory gracza.

Jeżeli gracz nie posiada odpowiedniego wiadra, akcja dojenia nie powinna być dostępna.

Nie implementować nowego systemu UI tylko dla zwierząt.

---

# 12. Persystencja

Stan produkcji zwierzęcia musi być uwzględniony w istniejącym systemie zapisu gry.

Po zapisie i wczytaniu należy zachować co najmniej:

- stan produkcji,
- czas następnej produkcji lub równoważny stan umożliwiający jego odtworzenie,
- informację o gotowym jajku, jeśli kura je posiada.

Nie dopuszczać do resetowania timerów produkcji po ponownym uruchomieniu gry bez uzasadnienia wynikającego z istniejącej architektury czasu/symulacji.

---

# 13. Poza zakresem

Nie implementować:

- ❌ zabijania zwierząt dla mięsa,
- ❌ mięsa,
- ❌ gotowania,
- ❌ przetwarzania jajek,
- ❌ przetwarzania mleka,
- ❌ sera,
- ❌ masła,
- ❌ nowych przepisów kulinarnych,
- ❌ craftingu wiader,
- ❌ nowych systemów pojemników,
- ❌ nowego systemu interakcji/UI,
- ❌ pancerza,
- ❌ skór jako produktu uboju.

---

# 14. Weryfikacja

## Kury

- [x] każda kura ma indywidualny stan produkcji,
- [x] każda kura ma własny timer/cooldown,
- [x] kura może wyprodukować maksymalnie jedno niezebrane jajko,
- [x] jajko może zostać pozostawione w świecie,
- [x] miejsce jajka wynika z pozycji kury,
- [x] jajko jest normalnym itemem świata,
- [x] jajko można zebrać,
- [x] po zebraniu rozpoczyna się kolejny cykl,
- [x] produkcja działa niezależnie od obecności gracza.

## Krowy

- [x] krowa produkuje **5 l mleka** na dojenie,
- [x] dojenie wymaga odpowiedniego pojemnika,
- [x] można użyć drewnianego wiadra,
- [x] można użyć miedzianego wiadra,
- [x] mleko trafia do pojemnika,
- [x] ilość mleka respektuje wolną pojemność pojemnika,
- [x] nie można przekroczyć pojemności,
- [x] dojenie jest czynnością trwającą w czasie,
- [x] czas dojenia zależy od ilości mleka,
- [ ] przyspieszenie czasu przyspiesza postęp dojenia — N/A: dojenie używa istniejącego busy-channel (jak `startCookAt`/`startIgniteFire`), a w obecnym kodzie żaden mechanizm przyspieszenia czasu nie przyspiesza busy-channeli w czasie rzeczywistym (patrz implementation notes),
- [x] po dojeniu obowiązuje cooldown,
- [x] cooldown jest indywidualny dla krowy.

## Owce

- [x] owca produkuje **2 l mleka** na dojenie,
- [x] dojenie wymaga odpowiedniego pojemnika,
- [x] mleko trafia do pojemnika,
- [x] nie można przekroczyć pojemności,
- [x] dojenie jest czynnością trwającą w czasie,
- [x] dojenie owcy trwa krócej niż dojenie krowy,
- [ ] przyspieszenie czasu przyspiesza postęp dojenia — patrz uwaga przy krowach,
- [x] po dojeniu obowiązuje cooldown,
- [x] cooldown jest indywidualny dla owcy.

## Pojemniki

- [x] wykorzystywany jest system pojemników z `items-player-001`,
- [x] mleko może być przechowywane w wiadrze,
- [x] ilość mleka jest częściowa,
- [x] puste/częściowo pełne wiadro zachowuje swój stan.

## Symulacja

- [x] produkcja nie zależy od renderowania,
- [x] produkcja działa poza aktywnym obszarem gracza zgodnie z istniejącą symulacją (tickuje tak samo jak głód/pragnienie zwierząt gospodarskich — tylko w załadowanych osadach),
- [ ] stan produkcji jest persystowany — świadome odstępstwo: żaden `AnimalAgent` (dziki ani gospodarski) nie ma dziś persystencji stanu; patrz implementation notes,
- [ ] wczytanie gry nie resetuje bezpodstawnie produkcji — zresetuje się tak samo jak reszta stanu zwierząt gospodarskich dziś (spójne z istniejącym zachowaniem, nie regresja).

## Integracja

- [x] wykorzystywane są istniejące mechanizmy zwierząt,
- [x] wykorzystywany jest istniejący system itemów,
- [x] wykorzystywany jest istniejący system pojemników,
- [x] wykorzystywany jest istniejący system interakcji,
- [x] nie powstają równoległe systemy produkcji.

## Techniczne

- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run test`
- [ ] browser/manual verification dla zmian widocznych w grze.

---

# 15. Następny etap

Po tym planie można zająć się dalszym wykorzystaniem produktów:

```text
kura
 ↓
jajko
 ↓
food / cooking
```

oraz:

```text
krowa / owca
 ↓
mleko
 ↓
food / cooking / processing
```

Osobny etap może później objąć przetwarzanie:

- jajek,
- mleka,
- innych produktów pochodzenia zwierzęcego.

**Zrób git commit i push do main, rebase jeżeli trzeba**

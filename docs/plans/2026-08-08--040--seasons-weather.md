# Seedvale — Pory roku i pogoda

> Szkic od ChatGPT

## 1. Pory roku

Świat ma 4 pory roku:

- 🌱 Wiosna
- ☀️ Lato
- 🍂 Jesień
- ❄️ Zima

Na początku:
- stała długość sezonu,
- sezon wynika z globalnego czasu świata,
- wszystkie systemy mogą odczytać aktualny `Season`.

```ts
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
```

Sezon powinien docelowo wpływać na:
- temperaturę,
- pogodę,
- roślinność,
- dostępność zasobów,
- źródła pożywienia,
- zachowanie zwierząt,
- potrzeby i zachowanie NPC,
- wygląd świata.

---

## 2. Pogoda

Pogoda powinna być **stanem świata**, a nie tylko efektem wizualnym.

Podstawowe typy:

- clear
- cloudy
- rain
- fog
- snow

```ts
type Weather =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'fog'
  | 'snow';
```

Burza może być późniejszym rozszerzeniem deszczu.

Pogoda nie zmienia się losowo co klatkę. Przechodzi pomiędzy stanami w określonych odstępach czasu.

Przykład:

```text
clear
  ↓
cloudy
  ↓
rain
  ↓
cloudy
  ↓
clear
```

---

## 3. Pogoda zależna od sezonu

Każda pogoda ma inne prawdopodobieństwo zależnie od pory roku.

### Wiosna
- częsty deszcz,
- zachmurzenie,
- mgły,
- łagodna temperatura.

### Lato
- dużo słońca,
- zachmurzenie,
- krótkie deszcze,
- możliwość burz,
- wysokie temperatury.

### Jesień
- częsty deszcz,
- zachmurzenie,
- mgły,
- spadająca temperatura.

### Zima
- zachmurzenie,
- śnieg,
- mróz,
- mniej deszczu.

Prawdopodobieństwa powinny być oparte na wagach, a nie twardych regułach.

---

## 4. Weather State

Świat posiada aktualny stan pogody:

```ts
interface WeatherState {
  type: Weather;
  intensity: number;
  temperature: number;
  startedAt: number;
  duration: number;
}
```

W przyszłości temperatura może stać się ważnym parametrem wykorzystywanym przez inne systemy.

---

## 5. Pogoda → świat

### Wizualnie

**Deszcz:**
- krople,
- mokre otoczenie,
- ciemniejsze światło,
- chmury,
- dźwięk deszczu.

**Śnieg:**
- opady śniegu,
- pokrywa śnieżna,
- zimniejsze światło.

**Mgła:**
- większa mgła,
- mniejszy visibility range.

**Zachmurzenie:**
- zmiana intensywności światła,
- zachmurzone niebo.

Na początku nie trzeba przebudowywać materiałów całego świata.

---

## 6. Pory roku → zasoby

Sezonowość powinna mieć znaczenie dla przyszłego systemu:

**resources → crafting → economy → barter**

Przykładowo:

### Wiosna
- młode rośliny,
- zioła,
- pierwsze owoce,
- więcej dostępnej wody.

### Lato
- zboże,
- owoce,
- warzywa,
- ryby,
- duża dostępność pożywienia.

### Jesień
- owoce,
- grzyby,
- zboże,
- drewno,
- przygotowywanie zapasów.

### Zima
- mało dzikiego jedzenia,
- brak części roślin,
- polowanie,
- korzystanie z wcześniej zgromadzonych zapasów.

Sezonowość powinna więc wpływać na **podaż i dostępność zasobów**, a później również na ekonomię osad.

---

## 7. Pory roku → fauna

Sezon może wpływać na:

- spawn rate,
- dostępność gatunków,
- aktywność,
- migrację,
- rozmnażanie — później,
- dostępność pożywienia.

Przykładowo:

```text
Jesień
→ większa aktywność związana z przygotowaniem do zimy

Zima
→ mniejsza aktywność

Wiosna
→ zwiększona aktywność
```

Na początku wystarczy prosty `seasonModifier`.

---

## 8. Pogoda → NPC

Pogoda powinna rozszerzać istniejący system:

**needs → FSM**

Przykłady:

```text
deszcz
→ częstsze szukanie schronienia

śnieg
→ krótsze przebywanie na zewnątrz

upał
→ większe znaczenie wody

mróz
→ większa potrzeba schronienia
```

Nie powinien powstać osobny system AI dla pogody.

---

## 9. Przyszłość — stamina / zmęczenie

Docelowo NPC mogą posiadać **staminę / energię**, która będzie spadać podczas pracy i regenerować się podczas odpoczynku.

Pogoda i temperatura mogłyby wtedy wpływać na tempo męczenia się — np. mróz powodowałby szybsze zużywanie energii.

To jednak **przyszły system**, nie część pierwszej implementacji pór roku i pogody.

---

## 10. Pogoda → zwierzęta

Podobnie jak NPC:

```text
deszcz
→ część zwierząt szuka schronienia

burza
→ mniejsza aktywność

zima
→ zmiana aktywności i dostępności pożywienia

lato
→ większa aktywność niektórych gatunków

mgła
→ zmiana zachowania / wykrywania
```

Powinno to rozszerzać istniejące AI zwierząt, a nie tworzyć osobny system.

---

## 11. Budynki i schronienie

W przyszłości budynki mogą mieć znaczenie nie tylko wizualne.

Dom może zapewniać NPC:

- schronienie przed pogodą,
- ochronę przed zimnem,
- miejsce odpoczynku,
- regenerację energii.

To dobrze połączy pogodę z przyszłym systemem potrzeb i zachowania NPC.

---

## 12. Cykl czasu

Istniejący czas świata powinien być podstawą wszystkich tych systemów:

```text
World Time
    │
    ├── Day / Night
    │
    └── Season
          │
          ├── Weather
          ├── Environment
          ├── Resources
          ├── NPC
          └── Animals
```

Nie tworzymy osobnych zegarów dla sezonów i pogody.

---

## 13. Architektura

Centralny stan świata może docelowo wyglądać mniej więcej tak:

```ts
WorldState
├── time
├── day
├── season
└── weather
```

Systemy odczytują informacje z `WorldState`:

```text
WorldState
   │
   ├── Environment
   ├── NPC Simulation
   ├── Animal Simulation
   ├── Resource System
   └── Economy
```

Kluczowa zasada:

**pogoda i sezon dostarczają informacji oraz modyfikatorów istniejącym systemom, zamiast tworzyć niezależne mechanizmy.**

---

## 14. Kolejność implementacji

### Etap 1 — fundament
- `Season`,
- globalny sezon,
- obliczanie sezonu z czasu świata,
- debug/UI.

### Etap 2 — Weather
- `WeatherState`,
- generator zmian pogody,
- prawdopodobieństwa zależne od sezonu,
- debug controls.

### Etap 3 — rendering
- deszcz,
- śnieg,
- chmury,
- mgła,
- zmiana oświetlenia.

### Etap 4 — wpływ na symulację
- NPC reagują na pogodę,
- zwierzęta reagują na pogodę,
- temperatura jako modifier.

### Etap 5 — zasoby
- sezonowa dostępność resource nodes,
- sezonowe źródła żywności,
- wpływ na osady.

### Etap 6 — ekonomia
- sezonowa podaż,
- niedobory,
- wartość/barter,
- przygotowanie osad do zimy.

---

## 15. Główna zasada

Pory roku i pogoda nie powinny być tylko efektami wizualnymi.

Docelowy przepływ:

```text
TIME
 ↓
SEASON
 ↓
WEATHER / TEMPERATURE
 ↓
ENVIRONMENT
 ↓
RESOURCES
 ↓
NPC / ANIMALS
 ↓
ECONOMY
```

Celem jest sytuacja, w której gracz nie tylko **widzi zimę**, ale może zauważyć:

> „Zima przyszła. Zwierząt jest mniej, pola nie produkują, NPC-e częściej siedzą w domach, a wieś zaczyna zużywać zapasy.”

To dobrze wspiera główną ideę Seedvale:

**świat żyje niezależnie od gracza.**

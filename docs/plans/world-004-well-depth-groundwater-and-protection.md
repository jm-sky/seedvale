# Plan: Well Depth, Groundwater & Well Protection

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~127~~  
**Domain:** `world`
**Tags:** `items-player` `settlements-npcs`

## Cel

Rozwinąć istniejący system **Player-Built Well** o:

- lokalną głębokość wody,
- zmienny czas kopania,
- wymagania narzędzi zależne od `capability`,
- linę jako przedmiot potrzebny przy głębokich studniach,
- działającą studnię bez daszka,
- konkretną negatywną konsekwencję braku daszka,
- podstawy pod przyszłe decyzje NPC dotyczące wyboru źródła wody.

Nie tworzyć nowego systemu studni. Rozszerzyć istniejący `PlayerWell` i `WaterSource`.

## 1. Głębokość wody

Każda studnia powinna mieć wyznaczoną głębokość do dostępnej wody.

### Wody gruntowe

Poziom wód gruntowych można deterministycznie wyliczać na podstawie:

- wysokości terenu,
- poziomu morza.

Wysokość terenu względem poziomu wód gruntowych określa podstawową głębokość studni.

Nie zakładać jednej globalnej głębokości dla całego świata.

### Podziemny zbiornik / ciek

Podziemne zbiorniki i cieki nie wymagają pełnej symulacji hydrologicznej.

Mogą być rozmieszczane **losowo**, z określonym prawdopodobieństwem i parametrami głębokości.

Lokalizacja może więc trafić na:

```text
groundwater
underground reservoir
underground stream
```

Każde źródło może zapewniać wodę na innej głębokości.

## 2. Zmienny czas kopania

Obecny stały czas etapu `pit` należy zastąpić czasem zależnym od wymaganej głębokości.

```text
większa głębokość
        ↓
więcej pracy
        ↓
dłuższy etap kopania
```

Pozostałe etapy (`well`, `roof`) nie muszą być zależne od głębokości.

Czas nadal powinien być liczony przez **world time**, zgodnie z istniejącym modelem `PlayerWell`.

## 3. Narzędzia — capability

Wymagania dotyczące narzędzi nie powinny wskazywać konkretnego `ItemKind`.

Studnia powinna wymagać odpowiedniej **tool capability**.

Przykładowo:

```text
shallow well
→ shovel capability

deep well
→ shovel capability
→ digging / pickaxe capability
```

Inventory powinno znaleźć dowolny przedmiot zapewniający wymaganą capability.

Dzięki temu różne narzędzia mogą spełniać to samo wymaganie bez specjalnego kodu w systemie studni.

## 4. Lina

**Lina (`rope`) zostaje dodana jako normalny przedmiot świata.**

Nie tworzyć specjalnego `WellRope`.

Rozdzielić:

```text
budowa studni
    ↓
narzędzia + materiały

korzystanie z głębokiej studni
    ↓
rope
```

Dokładny próg głębokości wymagający liny należy określić podczas implementacji.

## 5. Daszek nie jest wymagany do działania studni

Studnia powinna działać jako źródło wody już po ukończeniu korpusu:

```text
pit → well → WaterSource
             ↓
            roof
```

Daszek jest **ochroną i ulepszeniem**, a nie warunkiem aktywacji źródła.

## 6. Konsekwencja braku daszka

Woda pobrana ze studni **bez daszka** ma ryzyko negatywnego efektu.

Przy spożyciu:

```text
50% szansy
    ↓
-1–2 HP
-5 Vigor
```

Studnia z ukończonym daszkiem nie powoduje tego konkretnego efektu.

Nie implementować teraz pełnego systemu chorób tylko na potrzeby studni.

Mechanikę należy podłączyć do istniejącego modelu zdrowia/vigor, bez tworzenia `WellHealthSystem`.

## 7. Wizja zdrowia i chorób

Kwestia zdrowia, zanieczyszczonej wody i chorób powinna być opisana w dokumentacji wizji:

```text
docs/vision/
```

W odpowiedniej domenie, np.:

```text
docs/vision/health.md
```

jeżeli odpowiada to obecnej strukturze dokumentacji.

Dokument wizji powinien opisywać docelowo:

- jakość i bezpieczeństwo źródeł wody,
- zanieczyszczenia,
- choroby,
- wpływ jakości wody na mieszkańców,
- konsekwencje zdrowotne.

Ten plan implementuje tylko pierwszy konkretny przypadek:

> Niezadaszona studnia ma 50% szans na `-1–2 HP` i `-5 Vigor` przy spożyciu wody.

## 8. NPC — przyszły wybór źródła wody

Nie rozszerzać obecnego zakresu o pełny system decyzji NPC.

Docelowo NPC powinien móc wybierać pomiędzy dostępnymi `WaterSource` na podstawie aktualnej sytuacji.

Przyszły model:

```text
potrzeba wody
    ↓
dostępne WaterSources
    ↓
ocena źródeł
    ├── odległość
    ├── poziom pragnienia
    ├── jakość / bezpieczeństwo wody
    ├── cechy osobowości
    └── inne aktualne presje
    ↓
preferowane źródło
```

Przykładowe zachowania:

- mocno spragniony NPC → preferuje najbliższe źródło,
- ostrożny NPC → może wybrać bezpieczniejszą wodę mimo większej odległości,
- NPC bardziej skłonny do ryzyka → może korzystać z niezadaszonej studni,
- preferencja może zmieniać się wraz ze stanem NPC.

Powinno to docelowo należeć do istniejącego modelu **needs → pressures → decision → strategy**, a nie do systemu studni.

## 9. Model danych

Istniejący `PlayerWellRecord` należy rozszerzyć o wynik lokalnej oceny głębokości/źródła wody, jeżeli jest to potrzebne do zachowania deterministycznego zachowania po `save/load`.

Nie zapisywać danych, które można bezpiecznie odtworzyć z istniejącego stanu świata.

Studnia nadal pozostaje źródłem:

```text
PlayerWell
    ↓
WaterSource
```

Bez tworzenia osobnego systemu wody dla studni gracza.

## 10. NPC i WaterSource

Obecna integracja NPC z `WaterSource` pozostaje wspólna.

Nie dodawać specjalnych ścieżek:

```text
if playerWell ...
```

dla samej mechaniki głębokości.

Negatywny efekt niezadaszonej studni powinien wynikać z właściwości spożywanej wody/źródła, a nie z osobnego systemu NPC.

Przyszły wybór źródła wody powinien działać na wspólnym zbiorze `WaterSource`.

## 11. Persistence

Nowe właściwości studni muszą przetrwać:

- save/load,
- chunk unload/load,
- world rebuild,
- streaming.

Po odtworzeniu studni jej głębokość, źródło wody i wymagania muszą pozostać takie same.

Nie wolno ponownie losować źródła przy każdym załadowaniu chunka.

## 12. Performance

Nie wykonywać obliczeń głębokości ani geologii co frame.

Ocena lokalizacji powinna odbywać się podczas:

- rozpoczęcia budowy,
- utworzenia studni,
- ewentualnie placement preview, jeśli będzie potrzebne UX-owo.

Po utworzeniu studnia przechowuje stabilny wynik.

Brak potrzeby Web Workera.

## 13. Dokumentacja

Poza tym planem należy zaktualizować odpowiednią dokumentację wizji w:

```text
docs/vision/
```

Wizja i implementacja powinny być rozdzielone:

```text
docs/vision/health.md
        ↓
docelowy system zdrowia, chorób i jakości wody

plan studni
        ↓
konkretny efekt niezadaszonej studni
```

## 14. Poza zakresem

Nie implementować:

- pełnej symulacji hydrologicznej,
- realistycznej geologii,
- pełnych podziemnych sieci cieków,
- pełnego systemu chorób,
- rozbudowanego systemu jakości wody,
- degradacji studni,
- napraw studni,
- automatycznego budowania przez NPC,
- pełnego systemu decyzji wyboru `WaterSource` przez NPC.

## 15. Weryfikacja

### Technical

- `tsc`
- lint
- tests
- build

### Gameplay

Sprawdzić:

- różne głębokości studni,
- zależność głębokości od wysokości terenu,
- losowe podziemne zbiorniki/cieki,
- różny czas kopania,
- wymagania capability,
- głęboką studnię wymagającą odpowiedniego narzędzia,
- linę jako normalny przedmiot,
- możliwość ukończenia `well` bez daszka,
- działanie `WaterSource` bez daszka,
- 50% efektu negatywnego,
- `-1–2 HP`,
- `-5 Vigor`,
- brak efektu po zbudowaniu daszka,
- save/load zachowujący głębokość,
- poprawne działanie po chunk unload/load,
- NPC korzystających ze studni.

### End-to-end

```text
wybór lokalizacji
      ↓
wyznaczenie źródła i głębokości
      ↓
wykopanie zależne od głębokości
      ↓
wymagane capabilities
      ↓
ukończenie korpusu studni
      ↓
WaterSource
      ↓
pobranie wody bez daszka
      ↓
50% → -1–2 HP + -5 Vigor
      ↓
budowa daszka
      ↓
brak tego efektu
```

**Zrób git commit i push do main, rebase jeżeli trzeba**

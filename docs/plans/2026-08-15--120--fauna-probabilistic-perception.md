---
domain: fauna
---

# Plan: probabilistyczna percepcja zwierząt

**Created:** 2026-08-15  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** none

## Cel

Ulepszyć istniejący system `playerAwareness`, tak aby zwierzęta mogły zauważyć gracza z większej odległości, miały większą szansę wykrycia wraz ze zmniejszaniem dystansu, silnie uwzględniały kierunek patrzenia i nie działały deterministycznie na granicy wykrycia.

Zachować istniejące `flee/react behaviour`, deterministyczność symulacji oraz niski koszt CPU. Nie tworzyć osobnego systemu percepcji ani stealth.

## Aktualny stan

Istnieje `src/fauna/playerAwareness.ts` jako czysta logika detekcji oraz `playerAwareness.test.ts`. `AnimalAgent` korzysta z `isPlayerNoticed()`, a po wykryciu uruchamia istniejące zachowanie flee/react. Istnieją już modyfikatory dnia/nocy, lasu, dystansu i `facingDot`, a także `ALERT_HOLD_SEC` jako histereza.

Obecna detekcja jest binarna: `panicRange` oznacza automatyczne wykrycie, a poza nim wymagane są jednocześnie dystans w effective range i `facingDot >= minFacingDot`. Brakuje stopniowego prawdopodobieństwa wykrycia.

## Zakres implementacji

### 1. Rozszerzyć istniejący `playerAwareness`

Nie tworzyć równoległego systemu. Rozszerzyć istniejące parametry/funkcje tak, aby detekcja była oparta o:

```text
base notice range
 × day/night modifier
 × forest/environment modifier
 × facing modifier
 × distance probability
 → detection probability
```

### 2. Stopniowanie po dystansie

Zastąpić twardą granicę `distance <= noticeRange` ciągłym falloffem prawdopodobieństwa.

Docelowo:

- bardzo blisko → ~99%,
- w pobliżu `panicRange` → bardzo wysoka szansa,
- daleko, ale w notice range → niska, lecz realna szansa,
- poza notice range → 0%.

Zachować istniejące wartości zasięgów gatunkowych; strojenie parametrów gatunków pozostaje poza zakresem.

### 3. Kierunek patrzenia

`facingDot` powinien wpływać ciągle na prawdopodobieństwo, a nie tylko działać jako binarny próg.

- przód → najwyższa szansa,
- peryferia → wyraźnie niższa szansa,
- tył → praktycznie 0.

Nie zmieniać istniejącego sposobu wyliczania `facingDot` bez potrzeby.

### 4. Bliska odległość

Nie utrzymywać `panicRange` jako absolutnego `return true`. Zastąpić je bardzo wysokim prawdopodobieństwem wykrycia, pozostawiając niewielki margines losowości nawet z bardzo bliska.

### 5. Deterministyczne losowanie

Nie używać `Math.random()`.

Wykorzystać istniejący deterministyczny RNG, jeśli może zostać bezpiecznie użyty, albo oprzeć roll na istniejącym deterministycznym stanie (`animalId` + tick/czas percepcji). Identyczny stan symulacji musi prowadzić do identycznego wyniku.

### 6. Throttling i wydajność

Wykorzystać istniejący update cadence fauna. Nie zwiększać częstotliwości percepcji bez potrzeby.

Nie dodawać:

- raycastu dla każdego animal co frame,
- nowych globalnych spatial queries,
- nowych struktur śledzących wszystkie animals.

Obliczenia probability mają pozostać lekkie. Jeżeli obecny check można wykonać tylko na istniejącym perception tick, należy to zachować.

### 7. Przygotowanie pod stealth

Nie implementować jeszcze crouching, hiding, stealth skill, movement noise ani cover/occlusion.

Interfejs detekcji powinien jednak pozwalać później rozszerzyć wykrywalność np. o:

```text
base detectability
 × stealth modifier
 × movement/noise modifier
 × visibility modifier
 × ...
```

bez zmiany `AnimalAgent` i bez tworzenia drugiego systemu percepcji.

### 8. Gatunki

Rozwiązanie ma być generyczne dla wszystkich animals. Nie kodować logiki pod deer/stag.

Istniejące parametry gatunkowe (`playerNoticeRange`, `playerPanicRange`) pozostają źródłem konfiguracji.

## Testy

Rozszerzyć `src/fauna/playerAwareness.test.ts` o testy:

- bardzo blisko → bardzo wysoka probability,
- daleko i przodem → możliwe wykrycie,
- mniejszy dystans → wyższa probability,
- większy dystans → niższa probability,
- poza `noticeRange` → brak wykrycia,
- tyłem → zwykle brak wykrycia,
- bok/peryferia → wyraźnie niższa szansa,
- przodem → najwyższa szansa,
- noc/las nadal ograniczają effective range,
- identyczny seed/state daje identyczny roll,
- różne animals nie mają identycznego wzorca losowania.

Jeżeli poprawi to czytelność, testować osobno funkcję probability i deterministic roll.

## Integracja

Nie zmieniać `fleeFrom()`, `ALERT_HOLD_SEC`, predator/prey decision system, `AnimalLife`, herd behaviour, fire avoidance ani village avoidance.

Po wykryciu istniejąca ścieżka reakcji ma pozostać bez zmian.

## Weryfikacja techniczna

Uruchomić istniejący zestaw testów, typecheck/lint/build zgodnie z konfiguracją repozytorium. Co najmniej zweryfikować testy fauna oraz build/typecheck.

## Browser / gameplay verification

Jeśli środowisko browser verification jest dostępne, sprawdzić:

1. animal tyłem → zwykle brak reakcji,
2. animal przodem z dużej odległości → czasami wykrywa,
3. zmniejszanie dystansu → rosnąca szansa reakcji,
4. bardzo blisko → niemal zawsze, ale nie absolutnie zawsze,
5. przód/bok/tył → wyraźna różnica,
6. po wykryciu istniejące flee/react działa bez zmian,
7. wiele animals → brak istotnego wzrostu CPU/frame time.

## Poza zakresem

- raycast / pełny line-of-sight,
- stealth,
- crouching,
- hiding,
- noise propagation,
- sprint jako osobny modyfikator,
- nowe spatial structures,
- nowy system AI,
- niezwiązane refaktory.

## Oczekiwany efekt

Animal powinien reagować na kombinację dystansu, kierunku patrzenia i warunków środowiskowych zamiast zachowywać się jak prosty test promienia lub binarny FOV. Ma to dać naturalniejsze „zauważenie z daleka” i przygotować istniejący system pod przyszłe modyfikatory stealth.

## Weryfikacja końcowa

Podsumowanie implementacji powinno zawierać:

- zmienione pliki,
- funkcję probability/falloff,
- wpływ `facingDot`,
- sposób zachowania deterministyczności,
- wpływ na CPU/update frequency,
- wyniki testów/typecheck/lint/build,
- wynik browser verification,
- potwierdzenie zachowania istniejącego flee/react.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Grave Robbing Reputation Risk & Stealth

**Created:** 2026-09-07
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** world-007, quests-progression-001
**Domain:** `quests-progression`
**Subdomains:** `relationships` `progression`
**Tags:** `reputation` `renown` `stealth` `cemetery` `grave-robbing`
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać prostą konsekwencję społeczną dla rozkopywania grobów, wykorzystując istniejące mechanizmy cemetery Hidden Finds, Reputation & Renown, Sneak oraz porę dnia.

Naruszenie grobu nie zmienia automatycznie reputation. Przy pierwszym rozwiązaniu grave dig spotu wykonywany jest pojedynczy, deterministyczny **social exposure roll**, który abstrahuje ryzyko, że czyn stał się lokalnie znany.

Gracz może ograniczyć to ryzyko przez kopanie nocą i używanie Sneak. Plan świadomie nie implementuje świadków, NPC detection, plotek ani propagacji wiedzy.

Docelowy przepływ:

```text
grave spot disturbed
        ↓
record grave disturbance / badges
        ↓
calculate social exposure risk
        ↓
deterministic exposure roll
        ↓
┌──────────────────────┴──────────────────────┐
│                                             │
not exposed                               exposed
│                                             │
no reputation change                  integrity -8
no renown change                       trust -4
                                       renown +2
```

## Kontekst i ownership

`world-007-hidden-finds-and-reputation-badges` jest właścicielem cemetery Hidden Finds, grave disturbance oraz historycznych badges takich jak `Grave Robber` i `Desecrator`.

`quests-progression-001-reputation-and-renown-foundation` jest właścicielem lokalnego Reputation & Renown oraz semantyki wiedzy społecznej. Ten plan jest integracją tej warstwy z istniejącym zdarzeniem świata, dlatego należy do `quests-progression`.

Zachować rozdział:

```text
Badge / history = gracz rzeczywiście to zrobił
Reputation      = lokalna społeczność dowiedziała się o czynie
Renown          = jak szeroko gracz jest lokalnie znany
```

Nie łączyć ponownie BadgeManager z reputation.

## 1. Grave disturbance zawsze zapisuje historię

Naruszenie grave spotu zawsze wykonuje istniejący historyczny efekt:

```text
grave disturbed
→ gravesDisturbed progress
→ Grave Robber / Desecrator progression
```

Badge i progress nie zależą od social exposure.

Pusty grób również jest naruszeniem. Social consequence nie zależy od znalezienia ani wartości lootu.

## 2. Social exposure jako mały, czysty resolver

Dodać mały pure helper/resolver odpowiedzialny za:

- obliczenie finalnego exposure risk,
- wykonanie deterministycznego rolla,
- zwrócenie `exposed: boolean`.

Nie dodawać `CrimeManager`, `WitnessManager`, wanted level ani systemu skanującego zdarzenia per frame.

Resolver powinien przyjmować jawny kontekst, np.:

```ts
type SocialExposureContext = {
  baseRisk: number
  night: boolean
  sneakActive: boolean
  sneakValue: number
  eventRoll: number
}
```

Dokładny kontrakt może dopasować się do aktualnych typów, ale logika nie powinna zależeć bezpośrednio od cemetery ani `groundActions`.

Pierwszym consumerem jest grave disturbance. Inne przyszłe przypadki, np. theft lub vandalism, mogą użyć tego samego helpera, ale są poza zakresem planu.

## 3. Model ryzyka

### Bazowe ryzyko

W dzień, bez aktywnego Sneak:

```text
base exposure risk = 50%
```

### Noc

Noc odejmuje **30 punktów procentowych** od bazowego ryzyka:

```text
day   = 50%
night = 20%
```

Nie dodawać osobnych wartości dla dawn/dusk w V1. Użyć canonical day/night state z istniejącego systemu czasu.

### Sneak

Sneak redukuje **pozostałe** ryzyko liniowo według wartości skilla `0..100%`.

```text
riskAfterTime = night ? 0.20 : 0.50

if Sneak inactive:
  finalRisk = riskAfterTime

if Sneak active:
  finalRisk = riskAfterTime × (1 - sneakValue)
```

`sneakValue` jest normalizowane do `0..1`.

Przykłady przed zastosowaniem minimalnego floor:

| Warunki | Sneak | Ryzyko |
|---|---:|---:|
| dzień, bez Sneak | — | 50% |
| noc, bez Sneak | — | 20% |
| dzień | 25% | 37.5% |
| dzień | 50% | 25% |
| dzień | 75% | 12.5% |
| noc | 25% | 15% |
| noc | 50% | 10% |
| noc | 75% | 5% |

### Minimalne ryzyko

Po wszystkich modyfikatorach zastosować:

```text
minimum exposure risk = 2%
```

Dzięki temu nawet `Sneak = 100%` minimalizuje ryzyko, ale nie daje absolutnej gwarancji bezkarności.

Finalnie:

```text
finalRisk = max(0.02, riskAfterTime × sneakMultiplier)
```

Nie dodawać dodatkowych modyfikatorów zależnych od lootu, liczby grobów, settlement size ani bieżącej reputation.

## 4. Reuse istniejącego Sneak

Wykorzystać istniejące:

```text
PlayerSkills.sneak.active
PlayerSkills.sneak.value
```

Nie tworzyć `graveRobbingStealth`, `crimeStealth` ani osobnego skilla.

Jeżeli istniejący `sneakDetectionMultiplier()` ma semantykę możliwą do współdzielenia, wyciągnąć/reuse ogólny helper zamiast kopiować wzór z fauna. Nie tworzyć zależności reputation/social logic → fauna tylko dlatego, że obecny consumer Sneak znajduje się w `src/fauna/playerAwareness.ts`.

Nowy model social exposure ma zachować możliwość rozwoju `sneak.value` do pełnego zakresu `0..1`, nawet jeśli aktualna implementacja skilla używa obecnie stałej wartości.

## 5. Moment rozstrzygnięcia

Exposure rozstrzygać tylko wtedy, gdy istniejący Hidden Find resolver faktycznie oznaczy nowy cemetery grave spot jako resolved.

Nie wykonywać exposure:

- przy każdym użyciu łopaty na cmentarzu,
- przy kopaniu obok grave spotu,
- przy ponownym kopaniu resolved spotu,
- dla Hidden Finds w innych landmarkach.

Użyć stanu czasu i Sneak z momentu faktycznego resolution grave spotu.

Nie modelować visibility przez cały czas trwania animacji kopania.

## 6. Deterministyczny roll

Nie używać bezpośredniego `Math.random()`.

Roll musi być stabilny dla konkretnego zdarzenia grave disturbance i wynikać z istniejących deterministic/random utilities Seedvale.

Preferowany input:

```text
world seed
+ stable grave / Hidden Find spot identity
+ social-exposure salt
```

Roll jest stały dla danego grave spotu. Pora dnia i Sneak zmieniają threshold, a nie źródło losowości.

Przykład:

```text
deterministic roll = 0.18

day, no Sneak  → risk 0.50 → exposed
night, no Sneak → risk 0.20 → exposed
night, Sneak 50 → risk 0.10 → not exposed
```

Daje to przewidywalny deterministycznie świat bez możliwości reload-scumming.

## 7. Settlement scope

Reputation pozostaje lokalna per settlement.

Dla cemetery social consequence użyć tej samej najbliższej osady, którą obecny grave Hidden Find flow już potrafi wyznaczyć przez istniejący settlement lookup (`villageNearest` / aktualny odpowiednik w kodzie).

Nie tworzyć globalnej reputation ani nowego ownership cmentarza tylko dla tego feature.

Jeżeli current code w momencie implementacji posiada już stabilniejsze bezpośrednie `settlementId` dla cemetery, preferować je nad nearest-settlement heuristic.

Brak sensownej lokalnej osady oznacza brak settlement reputation consequence; historyczny badge nadal zostaje zapisany.

## 8. Social consequence po exposure

Jeżeli `exposed === true`, użyć istniejącego `applySocialConsequence()` / `ReputationManager` zamiast bezpośredniej mutacji standing w `groundActions`.

Jedno ujawnione naruszenie grobu daje:

```text
integrity -8
trust     -4
renown    +2
```

Uzasadnienie względem magnitude semantics `quests-progression-001`:

- `integrity -8` — meaningful negative: świadome naruszenie lokalnej normy społecznej,
- `trust -4` — minor negative: społeczność trochę mniej ufa osobie znanej z takiego czynu,
- `renown +2` — minor positive awareness: negatywny czyn zwiększa rozpoznawalność, ale nie jest dużym publicznym wydarzeniem.

Nie zmieniać:

```text
competence
benevolence
courage
```

Noc i Sneak wpływają tylko na prawdopodobieństwo exposure. Po udanym exposure kara ma zawsze tę samą wartość.

Nie skalować kary liczbą potencjalnych abstrakcyjnych świadków ani wartością lootu.

## 9. Brak witness simulation

Ten plan świadomie nie sprawdza:

- obecności NPC,
- odległości do NPC,
- line of sight,
- facing,
- hearing/noise,
- schedules/sleep,
- późniejszej propagacji informacji,
- gossip.

`social exposure` jest uproszczoną abstrakcją lokalnego ryzyka ujawnienia czynu.

Nie projektować dużego future-proof crime subsystemu pod hipotetycznych świadków.

## 10. Persistence

Nie dodawać nowego top-level persistence segmentu.

Wykorzystać istniejące:

```text
resolved Hidden Find spots
BadgeManager state
ReputationManager state
```

Po pierwszym resolution grave spotu:

1. badge/progress jest aktualizowany,
2. exposure jest rozstrzygane raz,
3. ewentualny social consequence trafia natychmiast do persistent ReputationManager,
4. spot pozostaje resolved.

Save/load nie może uruchomić exposure ponownie dla tego samego spotu.

## 11. UI i feedback

Nie pokazywać graczowi dokładnego procentu `Chance of being caught`.

Gameplay powinien komunikować zasadę pośrednio:

```text
noc = bezpieczniej
Sneak = bezpieczniej
noc + Sneak = najbezpieczniej
```

Nie dodawać nowej sekcji UI. Efekt społeczny jest widoczny przez istniejący Character Screen reputation/renown.

Jeżeli istniejący feedback path pozwala łatwo pokazać efekt po successful exposure, można użyć krótkiego istniejącego typu komunikatu. Brak takiego komunikatu nie blokuje feature.

Nie komunikować explicite udanego `not exposed`, ponieważ ujawniałoby to ukryty roll systemowy.

## 12. Performance

Mechanizm jest w pełni event-driven.

Koszt występuje wyłącznie przy pierwszym resolution grave spotu.

Nie dodawać:

- update loop,
- NPC scans,
- spatial queries,
- polling,
- workerów.

## 13. Relevant implementation points

Przed implementacją wykonać focused recon aktualnych symboli i call sites, w szczególności:

```text
src/app/actions/groundActions.ts
src/player/PlayerSkills.ts
src/fauna/playerAwareness.ts
src/reputation/ReputationManager.ts
src/badges/badges.ts
```

oraz:

- canonical day/night API,
- Hidden Find resolver i stable grave spot identity,
- deterministic RNG/hash utilities,
- settlement lookup używany przez cemetery flow,
- `createApp` dependency wiring,
- persistence resolved Hidden Finds i ReputationManager.

Current code jest źródłem prawdy. Jeżeli nazwy lub ownership zmieniły się względem planu, dostosować integrację do obecnej architektury zamiast odtwarzać stare call sites.

Dodać JSDoc z `@domain quests-progression` dla nowego publicznego/architektonicznego social-exposure helpera, jeżeli poprawi to preflight discovery.

## 14. Implementation order

1. Zweryfikować aktualny grave disturbance call site i stable spot identity.
2. Zweryfikować canonical day/night state.
3. Zweryfikować dostęp do aktualnego Sneak state/value.
4. Zweryfikować deterministic RNG/hash utility do rolla.
5. Dodać pure social exposure resolver z parametrami `50% / -30 p.p. night / Sneak 0..100% / 2% floor`.
6. Dodać focused unit tests matematyki i determinismu.
7. Podłączyć resolver wyłącznie do pierwszego resolution cemetery grave spotu.
8. Zachować niezależne `BadgeManager.recordGraveDisturbed()`.
9. Rozwiązać lokalny settlement scope przez istniejący lookup.
10. Po successful exposure wywołać istniejący social consequence z `integrity -8`, `trust -4`, `renown +2`.
11. Dodać integration tests grave disturbance → exposure → reputation.
12. Utworzyć implementation notes zgodnie z `PLANNING.md` z dokładnymi aktualnymi symbolami i ownership.
13. Zaktualizować relevant STATE/docs, jeśli implementacja zmienia opis obecnego zachowania.

## 15. Automated verification

Pokryć co najmniej:

### Risk calculation

- dzień + brak Sneak = `50%`,
- noc + brak Sneak = `20%`,
- dzień + Sneak 50% = `25%`,
- noc + Sneak 50% = `10%`,
- dzień + Sneak 75% = `12.5%`,
- noc + Sneak 75% = `5%`,
- Sneak 100% kończy na `2%` floor,
- nieaktywny Sneak ignoruje `sneak.value`,
- wartości wejściowe są clampowane do bezpiecznych zakresów,
- final risk pozostaje w `0..1`.

### Determinism

Dla tego samego:

```text
world seed
spot identity
exposure salt
```

roll jest identyczny.

Zmiana czasu lub Sneak może zmienić wynik `exposed` przez zmianę threshold, ale nie zmienia deterministic roll source.

### Grave disturbance

- nowy cemetery grave spot wykonuje exposure dokładnie raz,
- pusty spot również wykonuje exposure,
- resolved spot nie wykonuje go ponownie,
- zwykły Hidden Find poza cemetery nie wykonuje grave exposure,
- grave badge/progress aktualizuje się niezależnie od exposure.

### Reputation

Przy `exposed === false`:

```text
reputation unchanged
renown unchanged
```

Przy `exposed === true`:

```text
integrity -= 8
trust     -= 4
renown    += 2
```

Pozostałe reputation dimensions są bez zmian.

Brak settlementu nie powoduje globalnego fallbacku reputation.

### Persistence

- save/load zachowuje wynik social consequence przez ReputationManager,
- resolved grave nie rerolluje exposure po load.

## 16. Manual verification

User wykonuje verification w browserze.

Sprawdzić:

1. Grave robbery w dzień bez Sneak.
2. Grave robbery w dzień ze Sneak.
3. Grave robbery nocą bez Sneak.
4. Grave robbery nocą ze Sneak.
5. Empty grave nadal jest grave disturbance.
6. `Grave Robber` / `Desecrator` działa niezależnie od exposure.
7. Ujawniony czyn zmienia lokalne `integrity`, `trust` i `renown` w istniejącym UI.
8. Brak ujawnienia nie zmienia social standing.
9. Save/load nie pozwala ponownie rozstrzygnąć tego samego grave spotu.

Manual verification nie musi statystycznie udowadniać prawdopodobieństw; dokładne wartości pokrywają automated tests.

## 17. Non-goals

Poza zakresem:

- NPC witnesses,
- NPC line of sight,
- hearing/noise simulation,
- gossip i social knowledge propagation,
- delayed crime discovery,
- guards,
- wanted level,
- jail/fines,
- global reputation,
- osobna infamy,
- NPC confrontation podczas kopania,
- per-witness penalty stacking,
- reakcje NPC na `Grave Robber` badge,
- specjalna animacja grave robbery,
- osobna interakcja `Dig grave`,
- zmiany cemetery loot,
- zastosowanie social exposure do theft/combat w tym planie.

## Definition of Done

Plan jest ukończony, gdy:

```text
grave disturbance
→ zawsze zapisuje historyczny badge/progress
→ wykonuje jeden deterministic social exposure roll
→ dzień bez Sneak = 50% risk
→ noc odejmuje 30 p.p. = 20% risk przed Sneak
→ aktywny Sneak liniowo redukuje pozostałe ryzyko 0..100%
→ final risk ma 2% floor
→ successful exposure stosuje integrity -8 / trust -4 / renown +2
→ failed exposure nie zmienia reputation/renown
→ save/load nie umożliwia rerolla
```

bez witness simulation, nowego crime subsystemu ani duplikowania istniejących reputation, Sneak, time i Hidden Find mechanisms.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

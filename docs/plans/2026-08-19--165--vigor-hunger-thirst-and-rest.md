# Plan: Vigor, Hunger, Thirst and Rest

**Created:** 2026-08-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** `none`

## Cel

Urealnić zachowanie Vigor, Hunger i Thirst oraz zapewnić poprawną aktualizację status bars podczas odpoczynku i snu.

Plan jest oparty na sprawdzeniu obecnej implementacji. Najpierw zachowujemy istniejące mechanizmy, które już spełniają założenia, a zmieniamy tylko te elementy, które powodują niepożądane zachowanie.

## Jest

### Vigor

- `VigorState` przechowuje `max` i `current`.
- Vigor jest obecnie drenowany w oparciu o czas symulacji.
- Przy obecnej konfiguracji tempo jest na tyle duże, że stojący bezczynnie PC/NPC traci Vigor co kilka sekund czasu rzeczywistego.
- Obecny model traktuje passive drain jako zużywanie Vigor w ciągu dnia aktywności.
- Istnieją osobne funkcje `drainVigor()` i `restoreVigor()` oraz próg collapse.

### Hunger

- `HungerState` przechowuje `max` i `current`.
- `current` oznacza poziom najedzenia/satiation i spada w kierunku `0`.
- Obecny licznik został zaprojektowany tak, aby opróżniać się w ciągu kilku dni gry.
- `HUNGER_STARVING_THRESHOLD` wynosi obecnie `0`.
- Po osiągnięciu `0` głód może bezpośrednio powodować damage HP.
- Nie istnieje osobny licznik czasu przebywania w stanie głodu.

### Thirst

- `ThirstState` ma analogiczny model `max/current`.
- `THIRST_DEHYDRATED_THRESHOLD` wynosi obecnie `0`.
- Po osiągnięciu `0` odwodnienie może bezpośrednio powodować damage HP.
- Nie istnieje osobny licznik czasu przebywania w stanie odwodnienia.

### Rest / Sleep

- Istnieje już mechanizm odpoczynku/obozowania oraz pełnego snu.
- Sen ma własną regenerację Vigor i Stamina.
- Nie należy tworzyć osobnego systemu regeneracji dla planu 165 — należy wykorzystać istniejące mechanizmy.

### Status bars

- HUD posiada paski HP, Stamina, Vigor, Hunger i Thirst.
- Wartości HUD są prezentacyjnym stanem UI i są synchronizowane z Player state.
- Podczas odpoczynku/snu należy zapewnić, aby zmiany Vigor/Stamina były również przekazywane do UI.

## Problem

1. Passive drain Vigor jest zbyt szybki dla postaci, która nic nie robi.
2. Hunger/Thirst przechodzą bezpośrednio z poziomu `0` do HP damage, bez okresu narastających konsekwencji.
3. Kara przy średnim poziomie Hunger nie powinna występować — konsekwencje mają pojawiać się dopiero przy znacznym głodzie.
4. Czas przebywania w stanie głodu/odwodnienia nie jest obecnie modelowany osobno.
5. Paski Vigor/Stamina muszą poprawnie odzwierciedlać regenerację podczas obozowania i snu.

## Będzie

### 1. Vigor

- Bezczynność / odpoczynek: **−1 punkt Vigor / 24 h**.
- Aktywność będzie zużywała Vigor szybciej niż bezczynność.
- Chodzenie będzie miało większy koszt niż samo stanie/odpoczynek.
- Cięższe aktywności mogą mieć jeszcze większy koszt, zgodnie z istniejącym systemem aktywności.
- Passive drain nie będzie zależny od częstotliwości aktualizacji UI ani od tego, że postać stoi bezczynnie przez kilka sekund czasu rzeczywistego.
- Istniejące `drainVigor()` / `restoreVigor()` oraz mechanizm collapse zostaną zachowane, o ile nie okaże się podczas implementacji, że wymagają zmiany.

### 2. Hunger

Zachować obecny `Hunger` jako bieżący poziom najedzenia, ale dodać osobny licznik długotrwałego głodu:

```text
Hunger
    ↓ osiąga niski poziom progowy
StarvationDuration
    ↓ rośnie w czasie
Vigor/Stamina penalty
    ↓ po długim czasie
powolny HP loss
```

Założenia:

- przy normalnym i umiarkowanym poziomie Hunger brak kary,
- kara zaczyna się dopiero przy znacznym głodzie,
- kara dla Vigor/Stamina narasta stopniowo,
- przez pierwsze około 3 dni główną konsekwencją ma być spadek wydolności, a nie HP,
- po dłuższym okresie głodu zaczyna się powolny damage HP,
- odpowiednie nakarmienie resetuje lub odpowiednio zmniejsza `StarvationDuration`.

Dokładne progi, tempo narastania penalty i tempo HP loss zostaną dobrane podczas implementacji na podstawie istniejącego systemu czasu i wartości potrzeb.

### 3. Thirst

Zastosować analogiczny model do Hunger:

```text
Thirst
    ↓ osiąga niski poziom progowy
DehydrationDuration
    ↓ rośnie w czasie
Vigor/Stamina penalty
    ↓ po dłuższym czasie
powolny HP loss
```

Założenia:

- brak istotnej kary przy umiarkowanym poziomie Thirst,
- kara zaczyna się dopiero przy znacznym odwodnieniu,
- kara dla Vigor/Stamina narasta stopniowo,
- HP loss następuje dopiero po dłuższym odwodnieniu,
- skala czasowa odwodnienia jest krótsza niż głodu,
- odpowiednie nawodnienie resetuje lub odpowiednio zmniejsza `DehydrationDuration`.

### 4. Rest / Sleep

- Wykorzystać istniejący mechanizm odpoczynku i snu.
- Obóz i sen mają nadal regenerować Vigor/Stamina zgodnie z istniejącymi zasadami.
- Nie tworzyć równoległego mechanizmu regeneracji.
- Regeneracja ma być widoczna również podczas trwania odpoczynku, a nie dopiero po zakończeniu akcji.

### 5. Status bars

- Paski Vigor i Stamina mają aktualizować się podczas odpoczynku.
- Dotyczy to w szczególności obozowania i snu.
- UI ma odzwierciedlać bieżący stan Player state w trakcie upływu czasu odpoczynku.

## Implementacja

1. Zweryfikować dokładny punkt, w którym wykonywany jest passive drain Vigor, oraz jego zależność od czasu symulacji.
2. Zmienić tylko bazowe tempo passive drain na `1 / 24 h` dla bezczynności.
3. Zidentyfikować istniejące koszty Vigor związane z ruchem i aktywnością i rozszerzyć je zamiast tworzyć równoległy mechanizm.
4. Zidentyfikować istniejącą logikę `tickPlayerNeeds` i HP damage dla Hunger/Thirst.
5. Dodać czasowe stany `StarvationDuration` i `DehydrationDuration` w miejscu będącym właścicielem potrzeb, zamiast duplikować je w UI lub PlayerController.
6. Przenieść konsekwencje głodu/odwodnienia z prostego `level == 0 → HP damage` na model zależny od czasu przebywania w stanie krytycznym.
7. Wykorzystać istniejące mechanizmy regeneracji Rest/Sleep.
8. Znaleźć miejsce synchronizacji Player state → HUD i zapewnić jego wykonywanie podczas time-skip/rest/sleep.
9. Nie tworzyć osobnych systemów dla PC i NPC, jeżeli istniejący model może być współdzielony.

## Parametry docelowe

```text
Vigor passive drain:
    -1 / 24 h podczas bezczynności / odpoczynku

Hunger:
    umiarkowany głód → brak istotnej kary
    znaczny głód → narastający Vigor/Stamina penalty
    długotrwały głód → powolny HP loss

Thirst:
    umiarkowane pragnienie → brak istotnej kary
    znaczne odwodnienie → narastający Vigor/Stamina penalty
    długotrwałe odwodnienie → powolny HP loss
```

Dokładne wartości progów i krzywych nie są częścią obecnego ustalenia i powinny zostać wyprowadzone z istniejącego modelu czasu oraz przetestowane po implementacji.

## Weryfikacja

### Vigor

- stojący bezczynnie PC nie traci około 1 punktu co kilka sekund,
- passive drain wynosi około `1 punkt / 24 h`,
- aktywność zużywa Vigor szybciej niż bezczynność,
- istniejące koszty ruchu/pracy/walki pozostają spójne z nowym passive drain.

### Hunger / Thirst

- umiarkowany głód/pragnienie nie powoduje istotnego penalty,
- penalty zaczyna się dopiero przy ustalonym niskim poziomie,
- penalty Vigor/Stamina narasta wraz z czasem,
- HP nie zaczyna spadać natychmiast po osiągnięciu `0`,
- długotrwały głód/odwodnienie powoduje powolny HP loss,
- nakarmienie/nawodnienie kończy odpowiedni stan długotrwały.

### Rest / UI

- obozowanie regeneruje Vigor/Stamina,
- sen regeneruje Vigor/Stamina zgodnie z istniejącymi zasadami,
- paski Vigor/Stamina zmieniają się wizualnie podczas odpoczynku i snu,
- po zakończeniu odpoczynku UI i Player state są zgodne.

### Techniczne

- istniejące testy przechodzą,
- build/lint przechodzą zgodnie z `CLAUDE.md`,
- brak równoległego systemu potrzeb/regeneracji,
- brak niepowiązanych refaktorów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

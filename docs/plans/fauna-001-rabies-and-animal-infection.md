# Plan: Rabies and Animal Infection

**Created:** 2026-08-26
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~188~~
**Domain:** `fauna`

## Cel

Dodać do symulacji zwierząt chorobę wścieklizny jako trwały stan `AnimalAgent`, wykorzystując istniejące mechanizmy zachowania, ataku oraz lifecycle zwierząt i zwłok.

Wścieklizna ma tworzyć emergentny łańcuch:

```text
zakażenie → agresja → ugryzienia → kolejne zakażenia
→ śmierć → zepsute zwłoki → kolejne zakażenia
```

## Zakres

- wszystkie gatunki zwierząt mogą zostać zakażone;
- zakażenie pozostaje aktywne aż do śmierci zwierzęcia;
- zakażone zwierzę natychmiast staje się agresywne;
- chore zwierzęta nie powinny zachowywać normalnego lęku przed człowiekiem;
- zakażenie zdrowego zwierzęcia następuje przez ugryzienie zakażonego zwierzęcia;
- kontakt z zepsutymi zwłokami może zakazić zdrowe zwierzę;
- dla kontaktu ze zwłokami wystarczy wejście w promień 0.5 m;
- zakażone zwłoki pozostają potencjalnym źródłem zakażenia po przejściu do stanu zepsutych zwłok;
- V1 obejmuje wyłącznie transmisję pomiędzy zwierzętami;
- `setFrenzyWolf` pozostaje bez zmian i nadal służy wyłącznie do debugowego wymuszania frenzy.

## Architektura

### Stan choroby

Dodać stan wścieklizny do istniejącego `AnimalAgent`, zamiast tworzyć osobny `DiseaseManager` lub równoległy system chorób.

Rozdzielić:

```text
rabies = przyczyna / trwały stan chorobowy
frenzy = stan zachowania
```

Wścieklizna ma korzystać z istniejącego systemu decyzji/agresji zwierzęcia. Nie tworzyć osobnego AI dla chorych zwierząt.

### Transmisja przez ugryzienie

Wykorzystać istniejącą ścieżkę ataku/obrażeń zwierzęcia. Po faktycznym ugryzieniu zakażonego zwierzęcia wykonać pojedynczy roll infekcji dla celu.

Sprawdzenie nie może zależeć od częstotliwości ticków ani FPS.

### Transmisja przez zwłoki

Wykorzystać lifecycle zwłok wprowadzony przez plan 188. Kontakt żywego zwierzęcia z zepsutymi zwłokami w promieniu 0.5 m uruchamia pojedynczą próbę zakażenia.

Nie tworzyć niezależnego systemu padliny ani drugiego lifecycle zwłok.

## Szczegóły zachowania

Zakażone zwierzę:

- nie czeka na okres inkubacji;
- od momentu zakażenia otrzymuje zachowanie właściwe dla wścieklizny;
- może atakować inne zwierzęta niezależnie od normalnego predator/prey fear;
- pozostaje zakażone do śmierci.

W V1 nie dodawać leczenia ani naturalnego wyzdrowienia.

## Parametry

Parametry transmisji powinny być stałymi konfiguracyjnymi, a nie magicznymi liczbami rozproszonymi po kodzie.

Minimalnie:

```text
RABIES_CORPSE_CONTACT_RADIUS = 0.5
RABIES_CORPSE_INFECTION_CHANCE = 0.5
RABIES_BITE_INFECTION_CHANCE = <do ustalenia podczas implementacji>
```

Szansa 50% dotyczy kontaktu z zepsutymi zwłokami zgodnie z założeniem feature'u.

## Integracja z istniejącymi systemami

Przed implementacją prześledzić aktualne ścieżki:

- `AnimalAgent` i stan `frenzy`;
- wybór celu oraz zachowanie przed/po ataku;
- faktyczne wykonanie ugryzienia/obrażeń;
- lifecycle śmierci i przejścia zwłok do stanu zepsutego;
- istniejące interakcje zwierząt z padliną;
- aktualizację zwierząt w symulacji off-screen/time-skip.

Rozszerzać istniejące mechanizmy zamiast tworzyć równoległe systemy.

## Testy

Dodać testy deterministyczne dla:

- zakażenia przez zepsute zwłoki w promieniu 0.5 m;
- braku zakażenia poza promieniem;
- 50% rolla dla kontaktu ze zwłokami;
- zakażenia przez ugryzienie;
- braku zakażenia bez faktycznego ugryzienia;
- trwałości zakażenia do śmierci;
- natychmiastowego przejścia chorego zwierzęcia do zachowania agresywnego;
- możliwości zakażania różnych gatunków;
- zakaźności zepsutych zwłok zakażonego zwierzęcia;
- niezależności wyniku od częstotliwości ticków/FPS.

Nie zmieniać i nie rozszerzać kontraktu `setFrenzyWolf` poza konieczne testy regresyjne.

## Weryfikacja

### Automatyczna

- unit tests dla stanu choroby i transmisji;
- testy istniejącego `frenzy` pozostają zielone;
- lint/typecheck/build.

### Browser/manual

Zweryfikować w działającym świecie:

1. zakażone zwierzę natychmiast atakuje zamiast uciekać;
2. ugryzienie może zarazić inne zwierzę;
3. zdrowe zwierzę przechodzące przez promień 0.5 m od zepsutych zwłok może zostać zakażone;
4. zakażone zwłoki mogą zapoczątkować kolejne przypadki;
5. choroba działa bez udziału gracza;
6. istniejące `setFrenzyWolf` działa dokładnie jak wcześniej.

## Poza zakresem

- zakażanie NPC;
- zakażanie gracza;
- leczenie;
- szczepienia;
- okres inkubacji;
- osobny generyczny framework chorób;
- UI choroby;
- debug command zmieniający rabies;
- zmiana `setFrenzyWolf`.

**Zrób git commit i push do main, rebase jeżeli trzeba**

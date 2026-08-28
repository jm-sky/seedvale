# Implementation Notes: Rabies and Animal Infection

**Reviewed:** 2026-08-29
**Plan:** `fauna-001-rabies-and-animal-infection.md`
**Current code baseline:** main, 2026-08-29

## 1. Najważniejsze ustalenia z review

Plan pasuje do obecnej architektury, ale wymaga jednego istotnego rozszerzenia: obecne ugryzienie zwierzęcia jest częścią predator-only `updatePredator() → attack(prey)`. Wścieklizna ma dotyczyć wszystkich `AnimalKind`, więc nie wystarczy dodać flagi i ustawić `frenzied` w istniejącym branchu predatorów.

Nie tworzyć osobnego AI/disease managera. Najmniejsza spójna zmiana to rozszerzenie `AnimalAgent` o stan choroby oraz istniejącego wyboru/ataku tak, aby chore zwierzę mogło wybrać i zaatakować żywe zwierzę niezależnie od swojej normalnej roli. Normalny predator/prey AI powinien pozostać bez zmian dla zdrowych zwierząt.

## 2. Istniejące punkty integracji

### `src/fauna/AnimalAgent.ts`

To jest główny właściciel stanu i zachowania zwierzęcia. Już zawiera:

- `health: HealthState`,
- potrzeby/staminę w `AnimalLifeState`,
- `attackCooldown` i `CONTACT_RANGE = 0.8`,
- predator → prey przez `attack(prey)`,
- player/NPC → animal przez `takeDamage()`,
- corpse lifecycle: `fresh → rotting → bones`,
- `advanceCorpseDecay(dt, others, observerPos)`,
- lokalną listę `others` przekazywaną z `Fauna.update()`,
- `resolveTimeSkip()`.

Nie dodawać drugiej listy zwierząt ani globalnego registry.

### Corpse lifecycle

Plan 188 jest już zaimplementowany w `AnimalAgent`. Gnijące zwłoki są rozpoznawane przez `corpsePhase() === 'rotting'`, a faza bones tworzy istniejące natural remains. Nie zmieniać tego lifecycle.

Dla wścieklizny potrzebny jest osobny, trwały względem śmierci bit informacji: zwłoki muszą pamiętać, że zwierzę było zakażone. Najprościej zachować ten stan na tym samym `AnimalAgent`; po śmierci agent nadal istnieje przez obecne ~60 s corpse linger.

Nie uzależniać zakaźności od `rotting` wyłącznie przez zmianę fazy — zdrowe/fresh corpse nie ma zakażać, natomiast zakażony corpse ma pozostać źródłem zakażenia po wejściu w `rotting`.

### `src/fauna/createFauna.ts`

`Fauna.update()` przekazuje wszystkim agentom ten sam lokalny `agents` array. To jest właściwy bounded/local seam dla transmisji między zwierzętami. Nie skanować świata, settlementów ani chunków.

Spawnerów nie trzeba zmieniać. Zakażenie jest stanem pojedynczego agenta i może dotyczyć również livestock.

## 3. Zachowanie chorego zwierzęcia

Nie używać istniejącego `frenzied` jako stanu rabies. Plan słusznie rozdziela:

- `rabies` = przyczyna/stan chorobowy,
- `frenzy` = zachowanie/debug state.

`setFrenzyWolf()` ma pozostać bez zmian.

Po zakażeniu chore zwierzę powinno omijać normalny fear/prey branch i przejść przez istniejący movement/attack seam. Nie kopiować `updatePredator()` do nowej funkcji typu `updateRabid()`; jeżeli potrzebne jest wspólne "wybierz żywe zwierzę → chase → attack", wyciągnąć minimalny wspólny mechanizm.

Dla chorego livestock/prey trzeba świadomie dopuścić atak, ponieważ obecnie `attack(prey)` istnieje tylko dla predatorów. To jest główna różnica względem planu 179.

## 4. Transmisja przez ugryzienie

Najlepszy punkt to faktyczne wykonanie istniejącego `attack(prey)` / jego rozszerzonego odpowiednika.

Reguła:

1. sprawdź, czy attacker ma rabies;
2. wykonaj normalne obrażenia;
3. tylko po faktycznym ugryzieniu wykonaj jeden roll infekcji celu;
4. cel musi być żywy i niezakażony.

Nie wykonywać rolla w `chase`, przy samym kontakcie ani w każdym ticku.

`ATTACK_COOLDOWN = 0.6` już ogranicza częstotliwość ugryzień. Jeden roll na event ataku daje zachowanie niezależne od FPS.

### Szansa

Plan pozostawia `RABIES_BITE_INFECTION_CHANCE` do ustalenia. Ustalić ją jako pojedynczą stałą konfiguracyjną przed implementacją; nie rozrzucać wartości po `AnimalAgent` i testach.

## 5. Transmisja przez zwłoki

Wykorzystać `advanceCorpseDecay()` / lokalne `others`. Nie tworzyć corpse managera.

Kontakt powinien być sprawdzany tylko dla:

- żywego odbiorcy,
- `other` w promieniu `RABIES_CORPSE_CONTACT_RADIUS = 0.5`,
- corpse w fazie `rotting`,
- corpse oznaczonego jako zakażony.

Najważniejsza pułapka: nie można wykonywać 50% rolla co tick. Zwierzę stojące przez 10–20 sekund przy jednym corpse dostałoby dziesiątki prób.

Potrzebny jest więc per-agent/per-corpse exposure guard, np. zbiór stabilnych `animalId` kontaktów albo mały stan ekspozycji. Po pierwszym sprawdzeniu danego corpse dla danego żywego zwierzęcia kontakt jest już obsłużony. Nie używać czasu renderu jako cooldownu.

## 6. Determinism / RNG

Nie wprowadzać nowej zależności od FPS. Roll infekcji powinien być związany z dyskretnym eventem (bite/exposure), nie z ciągłym tickiem.

Obecny `AnimalAgent` nadal używa `Math.random()` w wielu miejscach, więc nie należy twierdzić, że cały moduł jest obecnie idealnie deterministyczny. Dla nowego systemu nie pogarszać sytuacji: najlepiej użyć istniejącego wzorca seeded/event RNG, jeśli jest dostępny w aktualnym kodzie, albo wstrzykiwanego RNG w czystym helperze/testach. Nie dodawać osobnego globalnego RNG managera tylko dla rabies.

## 7. Time-skip / off-screen

Obecny `Fauna.update()` wykonuje interakcje tylko dla istniejących agentów. `resolveTimeSkip()` aktualnie przyspiesza potrzeby i corpse timer, ale nie rekonstruuje interakcji zwierząt.

Dlatego V1 powinno:

- zachować rabies na istniejącym agencie,
- pozwolić corpse lifecycle przejść przez time-skip,
- nie generować sztucznych bite/exposure events podczas `resolveTimeSkip()`.

Nie próbować odtwarzać całego łańcucha infekcji podczas time-skip bez istniejącego mechanizmu agregowanej symulacji interakcji. To byłoby nowe, równoległe simulation path.

Warto natomiast dopilnować, aby po time-skip zakażone zwłoki nadal miały poprawny stan aż do usunięcia.

## 8. Testy

Najlepiej utrzymać większość logiki testowalną jako pure helpers:

- distance/radius dla corpse exposure,
- infection roll,
- pojedyncza ekspozycja na konkretny corpse,
- target selection dla rabid animal,
- rabies state survives `health.dead`,
- bite event → infection attempt.

Integracyjnie sprawdzić tylko seam `AnimalAgent`:

- zdrowy target nie zakaża się bez faktycznego attack event,
- infected attacker może zaatakować każdy `AnimalKind`,
- normalne predator/prey zachowanie zdrowych zwierząt nie zmienia się.

Nie testować `setFrenzyWolf()` przez rabies; istniejący kontrakt ma pozostać nietknięty.

## 9. Potencjalne pułapki

- **Nie utożsamiać rabies z `frenzied`.** Debug frenzy ma nadal działać niezależnie.
- **Nie ograniczać zakażenia do predatorów.** Wymóg obejmuje wszystkie gatunki.
- **Nie wykonywać corpse rolla co tick.** Konieczny jest one-shot exposure guard.
- **Nie zakażać przez zwykłe wejście w zasięg żywego zwierzęcia.** Bite musi być realnym eventem.
- **Nie dodawać disease/status-effect framework.** V1 potrzebuje tylko jednego stanu w `AnimalAgent`.
- **Nie dodawać globalnego skanu fauny.** `others` w istniejącym update pipeline wystarcza.
- **Nie dodawać persistence rabies**, jeśli fauna runtime nadal nie jest źródłem SaveData. Po reloadzie obecna architektura i tak nie odtwarza pełnego stanu pojedynczych zwierząt.
- **Nie rozszerzać time-skip o nową symulację interakcji.**
- Zwrócić uwagę na kolejność iteracji `agents`: zakażenie podczas ticka może wpłynąć na później aktualizowane zwierzę w tym samym ticku. Jeżeli to ma znaczenie dla determinismu, rozważyć jawne event/phase boundary zamiast pozwalać na przypadkową kolejność.

## 10. Zależność 188

Plan 188 jest obecnie w repo jako `verification needed`, ale jego wymagany corpse lifecycle jest już obecny w `AnimalAgent` (rotting/bones, natural remains, time-based progression).

Nie implementować ponownie 188. Przed wdrożeniem fauna-001 warto jedynie upewnić się, że agent traktuje aktualny kod 188 jako źródło prawdy i nie opiera się na historycznej wersji planu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
